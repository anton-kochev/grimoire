import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from 'vitest';
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { evaluateEnforce, runEnforce, runSubagentStart, runSubagentStop } from '../src/enforce.js';
import { APPROACH_CHECK_MARKER } from '../src/approaches.js';
import type { PreToolUseInput } from '../src/types.js';

function makeTmpDir(prefix: string): string {
  const raw = join(tmpdir(), `enforce-test-${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(raw, { recursive: true });
  return realpathSync(raw);
}

function makeManifest(
  projectDir: string,
  agents: Record<string, {
    file_patterns?: string[];
    approaches?: Array<{ name?: string; directive?: string; skill?: string }>;
  }>,
): void {
  const claudeDir = join(projectDir, '.claude');
  mkdirSync(claudeDir, { recursive: true });
  const grimoirePath = join(claudeDir, 'grimoire.json');
  // Preserve existing grimoire.json keys (e.g. enforcement) when adding router
  let existing: Record<string, unknown> = {};
  if (existsSync(grimoirePath)) {
    try { existing = JSON.parse(readFileSync(grimoirePath, 'utf-8')) as Record<string, unknown>; } catch { /* ignore */ }
  }
  writeFileSync(
    grimoirePath,
    JSON.stringify({
      ...existing,
      router: {
        version: '2.0.0',
        config: {
          weights: { keywords: 1.0, file_extensions: 1.5, patterns: 2.0, file_paths: 2.5 },
          activation_threshold: 3.0,
        },
        skills: [],
        agents,
      },
    }),
  );
}

/** Creates a local agent definition so the subagent hooks treat the type as tracked. */
function writeAgentDef(projectDir: string, agentType: string): void {
  const agentsDir = join(projectDir, '.claude', 'agents');
  mkdirSync(agentsDir, { recursive: true });
  writeFileSync(join(agentsDir, `${agentType}.md`), `---\nname: ${agentType}\n---\nprompt`);
}

function writeGrimoireConfig(projectDir: string, config: { enforcement?: boolean; verboseEnforcementLog?: boolean; insights?: { archive?: boolean } }): void {
  const claudeDir = join(projectDir, '.claude');
  mkdirSync(claudeDir, { recursive: true });
  writeFileSync(join(claudeDir, 'grimoire.json'), JSON.stringify(config));
}

function makePreToolUseInput(
  toolName: 'Edit' | 'Write' | 'MultiEdit' | 'Read',
  filePath: string,
  sessionId = 'test-session',
  /** Set to simulate an edit originating inside a subagent of this type. */
  agentType?: string,
): PreToolUseInput {
  return {
    session_id: sessionId,
    hook_event_name: 'PreToolUse',
    tool_name: toolName as 'Edit' | 'Write' | 'MultiEdit',
    tool_use_id: 'tool-123',
    tool_input: { file_path: filePath },
    ...(agentType ? { agent_id: 'agent-instance-1', agent_type: agentType } : {}),
  };
}

// =============================================================================
// evaluateEnforce
// =============================================================================

describe('evaluateEnforce', () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = makeTmpDir('eval');
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  it('should allow non-editing tools', () => {
    // Arrange
    writeGrimoireConfig(projectDir, { enforcement: true });
    makeManifest(projectDir, {
      'grimoire.typescript-coder': { file_patterns: ['*.ts'] },
    });
    const input = makePreToolUseInput('Read', 'src/index.ts');

    // Act
    const result = evaluateEnforce(input, projectDir);

    // Assert
    expect(result.action).toBe('allow');
  });

  it('should allow when router config is missing from grimoire.json', () => {
    // Arrange — grimoire.json has enforcement but no router key
    writeGrimoireConfig(projectDir, { enforcement: true });
    const input = makePreToolUseInput('Edit', 'src/index.ts');

    // Act
    const result = evaluateEnforce(input, projectDir);

    // Assert
    expect(result.action).toBe('allow');
  });

  it('should allow when enforcement config is false', () => {
    // Arrange
    writeGrimoireConfig(projectDir, { enforcement: false });
    makeManifest(projectDir, {
      'grimoire.typescript-coder': { file_patterns: ['*.ts'] },
    });
    const input = makePreToolUseInput('Edit', 'src/index.ts');

    // Act
    const result = evaluateEnforce(input, projectDir);

    // Assert
    expect(result.action).toBe('allow');
  });

  it('should allow when grimoire.json is absent', () => {
    // Arrange — no writeGrimoireConfig call
    makeManifest(projectDir, {
      'grimoire.typescript-coder': { file_patterns: ['*.ts'] },
    });
    const input = makePreToolUseInput('Edit', 'src/index.ts');

    // Act
    const result = evaluateEnforce(input, projectDir);

    // Assert
    expect(result.action).toBe('allow');
  });

  it('should allow when no agents section exists', () => {
    // Arrange
    const claudeDir = join(projectDir, '.claude');
    mkdirSync(claudeDir, { recursive: true });
    writeFileSync(
      join(claudeDir, 'grimoire.json'),
      JSON.stringify({
        enforcement: true,
        router: {
          version: '2.0.0',
          config: {
            weights: { keywords: 1, file_extensions: 1.5, patterns: 2, file_paths: 2.5 },
            activation_threshold: 3,
          },
          skills: [],
        },
      }),
    );
    const input = makePreToolUseInput('Edit', 'src/index.ts');

    // Act
    const result = evaluateEnforce(input, projectDir);

    // Assert
    expect(result.action).toBe('allow');
  });

  it('should allow when the owning agent edits its own file (owner bypass)', () => {
    // Arrange — edit originates inside the owning subagent
    writeGrimoireConfig(projectDir, { enforcement: true });
    makeManifest(projectDir, {
      'grimoire.typescript-coder': { file_patterns: ['*.ts'] },
    });
    const input = makePreToolUseInput('Edit', 'src/index.ts', 'test-session', 'grimoire.typescript-coder');

    // Act
    const result = evaluateEnforce(input, projectDir);

    // Assert
    expect(result.action).toBe('allow');
    if (result.action === 'allow') {
      expect(result.ownerAgent).toBe('grimoire.typescript-coder');
    }
  });

  it('should block when the main thread (no agent_type) edits an owned file', () => {
    // Arrange — no agent_type => edit came from the main thread
    writeGrimoireConfig(projectDir, { enforcement: true });
    makeManifest(projectDir, {
      'grimoire.typescript-coder': { file_patterns: ['*.ts'] },
    });
    const input = makePreToolUseInput('Edit', 'src/utils.ts');

    // Act
    const result = evaluateEnforce(input, projectDir);

    // Assert
    expect(result.action).toBe('block');
    if (result.action === 'block') {
      expect(result.agents).toContain('grimoire.typescript-coder');
      expect(result.filePath).toBe('src/utils.ts');
    }
  });

  it('should block when a non-owner subagent edits a file owned by another agent', () => {
    // Arrange — a different specialist edits a TS file it does not own
    writeGrimoireConfig(projectDir, { enforcement: true });
    makeManifest(projectDir, {
      'grimoire.typescript-coder': { file_patterns: ['*.ts'] },
    });
    const input = makePreToolUseInput('Edit', 'src/index.ts', 'test-session', 'grimoire.csharp-coder');

    // Act
    const result = evaluateEnforce(input, projectDir);

    // Assert
    expect(result.action).toBe('block');
    if (result.action === 'block') {
      expect(result.agents).toContain('grimoire.typescript-coder');
    }
  });

  it('should block on Write tool', () => {
    // Arrange
    writeGrimoireConfig(projectDir, { enforcement: true });
    makeManifest(projectDir, {
      'grimoire.typescript-coder': { file_patterns: ['*.ts'] },
    });
    const input = makePreToolUseInput('Write', 'new-file.ts');

    // Act
    const result = evaluateEnforce(input, projectDir);

    // Assert
    expect(result.action).toBe('block');
  });

  it('should block on MultiEdit tool', () => {
    // Arrange
    writeGrimoireConfig(projectDir, { enforcement: true });
    makeManifest(projectDir, {
      'grimoire.typescript-coder': { file_patterns: ['*.ts'] },
    });
    const input = makePreToolUseInput('MultiEdit', 'src/api.ts');

    // Act
    const result = evaluateEnforce(input, projectDir);

    // Assert
    expect(result.action).toBe('block');
  });

  it('should allow when file does not match any pattern', () => {
    // Arrange
    writeGrimoireConfig(projectDir, { enforcement: true });
    makeManifest(projectDir, {
      'grimoire.typescript-coder': { file_patterns: ['*.ts'] },
    });
    const input = makePreToolUseInput('Edit', 'README.md');

    // Act
    const result = evaluateEnforce(input, projectDir);

    // Assert
    expect(result.action).toBe('allow');
  });

  it('should list all matching agents when multiple own the same file', () => {
    // Arrange
    writeGrimoireConfig(projectDir, { enforcement: true });
    makeManifest(projectDir, {
      'grimoire.csharp-coder': { file_patterns: ['*.cs'] },
      'grimoire.dotnet-architect': { file_patterns: ['*.cs', '*.csproj'] },
    });
    const input = makePreToolUseInput('Edit', 'src/MyService.cs');

    // Act
    const result = evaluateEnforce(input, projectDir);

    // Assert
    expect(result.action).toBe('block');
    if (result.action === 'block') {
      expect(result.agents).toHaveLength(2);
      expect(result.agents).toContain('grimoire.csharp-coder');
      expect(result.agents).toContain('grimoire.dotnet-architect');
    }
  });

  it('should allow the owner even when multiple agents match the file', () => {
    // Arrange — file owned by two agents; the edit comes from one of them
    writeGrimoireConfig(projectDir, { enforcement: true });
    makeManifest(projectDir, {
      'grimoire.csharp-coder': { file_patterns: ['*.cs'] },
      'grimoire.dotnet-architect': { file_patterns: ['*.cs', '*.csproj'] },
    });
    const input = makePreToolUseInput('Edit', 'src/MyService.cs', 'test-session', 'grimoire.dotnet-architect');

    // Act
    const result = evaluateEnforce(input, projectDir);

    // Assert
    expect(result.action).toBe('allow');
    if (result.action === 'allow') {
      expect(result.ownerAgent).toBe('grimoire.dotnet-architect');
    }
  });

  it('should not block when agent has empty file_patterns', () => {
    // Arrange
    writeGrimoireConfig(projectDir, { enforcement: true });
    makeManifest(projectDir, {
      'grimoire.typescript-coder': { file_patterns: [] },
    });
    const input = makePreToolUseInput('Edit', 'src/index.ts');

    // Act
    const result = evaluateEnforce(input, projectDir);

    // Assert
    expect(result.action).toBe('allow');
  });

  it('should match by basename glob even for deeply nested path', () => {
    // Arrange
    writeGrimoireConfig(projectDir, { enforcement: true });
    makeManifest(projectDir, {
      'grimoire.typescript-coder': { file_patterns: ['*.ts'] },
    });
    const input = makePreToolUseInput('Edit', 'packages/core/src/deep/util.ts');

    // Act
    const result = evaluateEnforce(input, projectDir);

    // Assert
    expect(result.action).toBe('block');
  });

  it('should block when absolute path matches relative pattern via projectDir', () => {
    // Arrange
    writeGrimoireConfig(projectDir, { enforcement: true });
    makeManifest(projectDir, {
      'grimoire.typescript-coder': { file_patterns: ['src/**/*.ts'] },
    });
    const absFilePath = join(projectDir, 'src', 'utils.ts');
    const input = makePreToolUseInput('Edit', absFilePath);

    // Act
    const result = evaluateEnforce(input, projectDir);

    // Assert
    expect(result.action).toBe('block');
    if (result.action === 'block') {
      expect(result.agents).toContain('grimoire.typescript-coder');
    }
  });

  it('should block when absolute path with spaces matches relative pattern', () => {
    // Arrange
    writeGrimoireConfig(projectDir, { enforcement: true });
    makeManifest(projectDir, {
      'grimoire.csharp-coder': { file_patterns: ['VendorPortal BE/**/*.cs'] },
    });
    const absFilePath = join(projectDir, 'VendorPortal BE', 'App', 'Foo.cs');
    const input = makePreToolUseInput('Edit', absFilePath);

    // Act
    const result = evaluateEnforce(input, projectDir);

    // Assert
    expect(result.action).toBe('block');
    if (result.action === 'block') {
      expect(result.agents).toContain('grimoire.csharp-coder');
    }
  });

  it('should allow when absolute path does not match relative pattern', () => {
    // Arrange
    writeGrimoireConfig(projectDir, { enforcement: true });
    makeManifest(projectDir, {
      'grimoire.typescript-coder': { file_patterns: ['src/**/*.ts'] },
    });
    const absFilePath = join(projectDir, 'other', 'utils.ts');
    const input = makePreToolUseInput('Edit', absFilePath);

    // Act
    const result = evaluateEnforce(input, projectDir);

    // Assert
    expect(result.action).toBe('allow');
  });

  it('should block when Windows absolute path matches relative pattern', () => {
    // Arrange
    writeGrimoireConfig(projectDir, { enforcement: true });
    makeManifest(projectDir, {
      'grimoire.csharp-coder': { file_patterns: ['VendorPortal BE/**/*.cs'] },
    });
    const winPath = 'C:\\Users\\AKochev\\project\\VendorPortal BE\\Services\\OnboardingService.cs';
    const input = makePreToolUseInput('Edit', winPath);

    // Act — configDir points to real temp dir for grimoire.json lookup
    const result = evaluateEnforce(input, 'C:\\Users\\AKochev\\project', projectDir);

    // Assert
    expect(result.action).toBe('block');
    if (result.action === 'block') {
      expect(result.agents).toContain('grimoire.csharp-coder');
    }
  });

  it('should block when Windows path with spaces matches pattern', () => {
    // Arrange
    writeGrimoireConfig(projectDir, { enforcement: true });
    makeManifest(projectDir, {
      'grimoire.csharp-coder': { file_patterns: ['My App/**/*.cs'] },
    });
    const winPath = 'C:\\Projects\\My App\\Controllers\\HomeController.cs';
    const input = makePreToolUseInput('Write', winPath);

    // Act
    const result = evaluateEnforce(input, 'C:\\Projects', projectDir);

    // Assert
    expect(result.action).toBe('block');
    if (result.action === 'block') {
      expect(result.agents).toContain('grimoire.csharp-coder');
    }
  });

  it('should detect Windows absolute paths (drive letter)', () => {
    // Arrange
    writeGrimoireConfig(projectDir, { enforcement: true });
    makeManifest(projectDir, {
      'grimoire.typescript-coder': { file_patterns: ['*.ts'] },
    });
    const winPath = 'C:\\Users\\Dev\\project\\src\\index.ts';
    const input = makePreToolUseInput('Edit', winPath);

    // Act
    const result = evaluateEnforce(input, 'C:\\Users\\Dev\\project', projectDir);

    // Assert
    expect(result.action).toBe('block');
    if (result.action === 'block') {
      expect(result.agents).toContain('grimoire.typescript-coder');
    }
  });
});

// =============================================================================
// runEnforce logging
// =============================================================================

describe('runEnforce logging', () => {
  let projectDir: string;
  let logPath: string;

  beforeEach(() => {
    projectDir = makeTmpDir('enforce-log');
    logPath = join(projectDir, 'test-router.log');
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  it('should write a blocked log entry with correct fields', () => {
    // Arrange
    writeGrimoireConfig(projectDir, { enforcement: true });
    makeManifest(projectDir, {
      'grimoire.typescript-coder': { file_patterns: ['*.ts'] },
    });
    const input = makePreToolUseInput('Edit', 'src/utils.ts', 'session-xyz');
    const origEnv = process.env['CLAUDE_PROJECT_DIR'];
    process.env['CLAUDE_PROJECT_DIR'] = projectDir;

    // Act
    try {
      runEnforce(input, logPath);
    } catch { /* process.exit(0) throws in vitest */ }

    process.env['CLAUDE_PROJECT_DIR'] = origEnv;

    // Assert
    expect(existsSync(logPath)).toBe(true);
    const entry = JSON.parse(readFileSync(logPath, 'utf-8').trim()) as Record<string, unknown>;
    expect(entry['outcome']).toBe('blocked');
    expect(entry['enforce_block']).toBe(true);
    expect(entry['hook_event']).toBe('PreToolUse');
    expect(entry['tool_name']).toBe('Edit');
    expect(entry['session_id']).toBe('session-xyz');
    expect(entry['agent_type']).toBe(null);
    expect(entry['file_basename']).toBe('utils.ts');
    expect(entry['blocking_agents']).toContain('grimoire.typescript-coder');
    expect(typeof entry['timestamp']).toBe('string');
  });

  it('should write an owner-bypass allow log entry with agent_type', () => {
    // Arrange — the owning subagent edits its own file
    writeGrimoireConfig(projectDir, { enforcement: true });
    makeManifest(projectDir, {
      'grimoire.typescript-coder': { file_patterns: ['*.ts'] },
    });
    const input = makePreToolUseInput('Edit', 'src/utils.ts', 'session-xyz', 'grimoire.typescript-coder');
    const origEnv = process.env['CLAUDE_PROJECT_DIR'];
    process.env['CLAUDE_PROJECT_DIR'] = projectDir;

    // Act
    try {
      runEnforce(input, logPath);
    } catch { /* process.exit(0) throws in vitest */ }

    process.env['CLAUDE_PROJECT_DIR'] = origEnv;

    // Assert
    expect(existsSync(logPath)).toBe(true);
    const entry = JSON.parse(readFileSync(logPath, 'utf-8').trim()) as Record<string, unknown>;
    expect(entry['outcome']).toBe('allow');
    expect(entry['enforce_block']).toBe(false);
    expect(entry['owner_bypass']).toBe(true);
    expect(entry['agent_type']).toBe('grimoire.typescript-coder');
    expect(entry['file_basename']).toBe('utils.ts');
  });

  it('should NOT log an allow-passthrough entry for a non-matching file by default', () => {
    // Arrange — verboseEnforcementLog is off (absent)
    writeGrimoireConfig(projectDir, { enforcement: true });
    makeManifest(projectDir, {
      'grimoire.typescript-coder': { file_patterns: ['*.ts'] },
    });
    const input = makePreToolUseInput('Edit', 'README.md', 'session-xyz');
    const origEnv = process.env['CLAUDE_PROJECT_DIR'];
    process.env['CLAUDE_PROJECT_DIR'] = projectDir;

    // Act
    try {
      runEnforce(input, logPath);
    } catch { /* process.exit(0) throws in vitest */ }

    process.env['CLAUDE_PROJECT_DIR'] = origEnv;

    // Assert — passthrough allows are noise, suppressed unless opted in
    expect(existsSync(logPath)).toBe(false);
  });

  it('should log an allow-passthrough entry with debug info when verboseEnforcementLog is on', () => {
    // Arrange
    writeGrimoireConfig(projectDir, { enforcement: true, verboseEnforcementLog: true });
    makeManifest(projectDir, {
      'grimoire.typescript-coder': { file_patterns: ['*.ts'] },
    });
    const input = makePreToolUseInput('Edit', 'README.md', 'session-xyz');
    const origEnv = process.env['CLAUDE_PROJECT_DIR'];
    process.env['CLAUDE_PROJECT_DIR'] = projectDir;

    // Act
    try {
      runEnforce(input, logPath);
    } catch { /* process.exit(0) throws in vitest */ }

    process.env['CLAUDE_PROJECT_DIR'] = origEnv;

    // Assert
    expect(existsSync(logPath)).toBe(true);
    const entry = JSON.parse(readFileSync(logPath, 'utf-8').trim()) as Record<string, unknown>;
    expect(entry['outcome']).toBe('allow');
    expect(entry['enforce_block']).toBe(false);
    expect(entry['hook_event']).toBe('PreToolUse');
    expect(entry['tool_name']).toBe('Edit');
    expect(entry['session_id']).toBe('session-xyz');
    expect(entry['file_path']).toBe('README.md');
    expect(entry['patterns_checked']).toContain('*.ts');
  });

  it('should not write a log entry when enforcement is disabled (early allow)', () => {
    // Arrange — enforcement disabled in grimoire.json
    writeGrimoireConfig(projectDir, { enforcement: false });
    makeManifest(projectDir, {
      'grimoire.typescript-coder': { file_patterns: ['*.ts'] },
    });
    const input = makePreToolUseInput('Edit', 'README.md', 'session-xyz');
    const origEnv = process.env['CLAUDE_PROJECT_DIR'];
    process.env['CLAUDE_PROJECT_DIR'] = projectDir;

    // Act
    try {
      runEnforce(input, logPath);
    } catch { /* process.exit(0) throws in vitest */ }

    process.env['CLAUDE_PROJECT_DIR'] = origEnv;

    // Assert — early returns don't have debugInfo, so no log
    expect(existsSync(logPath)).toBe(false);
  });

  it('should log only the basename, not the full path', () => {
    // Arrange
    writeGrimoireConfig(projectDir, { enforcement: true });
    makeManifest(projectDir, {
      'grimoire.typescript-coder': { file_patterns: ['*.ts'] },
    });
    const input = makePreToolUseInput('Edit', 'packages/core/src/deep/util.ts');
    const origEnv = process.env['CLAUDE_PROJECT_DIR'];
    process.env['CLAUDE_PROJECT_DIR'] = projectDir;

    // Act
    try {
      runEnforce(input, logPath);
    } catch { /* process.exit(0) throws in vitest */ }

    process.env['CLAUDE_PROJECT_DIR'] = origEnv;

    // Assert
    const entry = JSON.parse(readFileSync(logPath, 'utf-8').trim()) as Record<string, unknown>;
    expect(entry['file_basename']).toBe('util.ts');
    expect(entry['file_basename']).not.toContain('/');
  });

  it('should include all matching agents in blocking_agents', () => {
    // Arrange
    writeGrimoireConfig(projectDir, { enforcement: true });
    makeManifest(projectDir, {
      'grimoire.csharp-coder': { file_patterns: ['*.cs'] },
      'grimoire.dotnet-architect': { file_patterns: ['*.cs', '*.csproj'] },
    });
    const input = makePreToolUseInput('Write', 'src/MyService.cs');
    const origEnv = process.env['CLAUDE_PROJECT_DIR'];
    process.env['CLAUDE_PROJECT_DIR'] = projectDir;

    // Act
    try {
      runEnforce(input, logPath);
    } catch { /* process.exit(0) throws in vitest */ }

    process.env['CLAUDE_PROJECT_DIR'] = origEnv;

    // Assert
    const entry = JSON.parse(readFileSync(logPath, 'utf-8').trim()) as Record<string, unknown>;
    const agents = entry['blocking_agents'] as string[];
    expect(agents).toHaveLength(2);
    expect(agents).toContain('grimoire.csharp-coder');
    expect(agents).toContain('grimoire.dotnet-architect');
  });
});

// =============================================================================
// runSubagentStart — telemetry only (no registry)
// =============================================================================

describe('runSubagentStart', () => {
  let projectDir: string;
  let logPath: string;
  let origProjectDirEnv: string | undefined;

  beforeEach(() => {
    projectDir = makeTmpDir('subagent-start');
    logPath = join(projectDir, 'test-router.log');
    origProjectDirEnv = process.env['CLAUDE_PROJECT_DIR'];
    process.env['CLAUDE_PROJECT_DIR'] = projectDir;
  });

  afterEach(() => {
    process.env['CLAUDE_PROJECT_DIR'] = origProjectDirEnv;
    rmSync(projectDir, { recursive: true, force: true });
  });

  it('should write a SubagentStart telemetry log entry', () => {
    writeAgentDef(projectDir, 'grimoire.csharp-coder');

    // Act
    try {
      runSubagentStart({ session_id: 'session-abc', agent_id: 'agent-1', agent_type: 'grimoire.csharp-coder' }, logPath);
    } catch { /* process.exit(0) throws in vitest */ }

    // Assert
    expect(existsSync(logPath)).toBe(true);
    const entry = JSON.parse(readFileSync(logPath, 'utf-8').trim()) as Record<string, unknown>;
    expect(entry['hook_event']).toBe('SubagentStart');
    expect(entry['session_id']).toBe('session-abc');
    expect(entry['agent_id']).toBe('agent-1');
    expect(entry['agent_type']).toBe('grimoire.csharp-coder');
    expect(typeof entry['timestamp']).toBe('string');
  });

  it('should skip built-in agents that have no local definition file', () => {
    // Act — no .claude/agents/Explore.md exists
    try {
      runSubagentStart({ session_id: 'session-abc', agent_id: 'agent-1', agent_type: 'Explore' }, logPath);
    } catch { /* process.exit(0) throws in vitest */ }

    // Assert — nothing written
    expect(existsSync(logPath)).toBe(false);
  });

  it('should record null agent fields when absent', () => {
    // Act
    try {
      runSubagentStart({ session_id: 'session-abc' }, logPath);
    } catch { /* process.exit(0) throws in vitest */ }

    // Assert
    const entry = JSON.parse(readFileSync(logPath, 'utf-8').trim()) as Record<string, unknown>;
    expect(entry['agent_id']).toBe(null);
    expect(entry['agent_type']).toBe(null);
  });

  it('should not create a subagent registry file', () => {
    // Act
    try {
      runSubagentStart({ session_id: 'session-abc', agent_id: 'agent-1' }, logPath);
    } catch { /* process.exit(0) throws in vitest */ }

    // Assert — the old registry mechanism is gone
    expect(existsSync(join(projectDir, '.claude', 'hooks', '.grimoire-subagents.json'))).toBe(false);
  });
});

// =============================================================================
// runSubagentStart — approach mandate injection
// =============================================================================

describe('runSubagentStart approach injection', () => {
  let projectDir: string;
  let logPath: string;
  let origProjectDirEnv: string | undefined;
  let stdoutSpy: MockInstance;

  const TDD = { name: 'tdd', directive: 'Tests first.', skill: 'grimoire.unit-testing-dotnet' };

  beforeEach(() => {
    projectDir = makeTmpDir('subagent-start-inject');
    logPath = join(projectDir, 'test-router.log');
    origProjectDirEnv = process.env['CLAUDE_PROJECT_DIR'];
    process.env['CLAUDE_PROJECT_DIR'] = projectDir;
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    process.env['CLAUDE_PROJECT_DIR'] = origProjectDirEnv;
    rmSync(projectDir, { recursive: true, force: true });
  });

  function stdoutText(): string {
    return stdoutSpy.mock.calls.map((c) => String(c[0])).join('');
  }

  function start(agentType?: string): void {
    try {
      runSubagentStart(
        { session_id: 'session-abc', agent_id: 'agent-1', ...(agentType ? { agent_type: agentType } : {}) },
        logPath,
      );
    } catch { /* process.exit(0) throws in vitest */ }
  }

  it('should inject the approach mandate on stdout when the agent has approaches', () => {
    writeAgentDef(projectDir, 'grimoire.csharp-coder');
    makeManifest(projectDir, { 'grimoire.csharp-coder': { approaches: [TDD] } });

    start('grimoire.csharp-coder');

    const output = JSON.parse(stdoutText()) as {
      hookSpecificOutput: { hookEventName: string; additionalContext: string };
    };
    expect(output.hookSpecificOutput.hookEventName).toBe('SubagentStart');
    expect(output.hookSpecificOutput.additionalContext).toContain('tdd');
    expect(output.hookSpecificOutput.additionalContext).toContain('Tests first.');
    expect(output.hookSpecificOutput.additionalContext).toContain(
      'with skill "grimoire.unit-testing-dotnet"',
    );
  });

  it('should log approaches_enforced with the injected approach names', () => {
    writeAgentDef(projectDir, 'grimoire.csharp-coder');
    makeManifest(projectDir, {
      'grimoire.csharp-coder': { approaches: [TDD, { name: 'docs-first', directive: 'Docs first.' }] },
    });

    start('grimoire.csharp-coder');

    const entry = JSON.parse(readFileSync(logPath, 'utf-8').trim()) as Record<string, unknown>;
    expect(entry['approaches_enforced']).toEqual(['tdd', 'docs-first']);
  });

  it('should not write stdout when the agent has no approaches', () => {
    writeAgentDef(projectDir, 'grimoire.csharp-coder');
    makeManifest(projectDir, { 'grimoire.csharp-coder': {} });

    start('grimoire.csharp-coder');

    expect(stdoutSpy).not.toHaveBeenCalled();
    const entry = JSON.parse(readFileSync(logPath, 'utf-8').trim()) as Record<string, unknown>;
    expect(entry).not.toHaveProperty('approaches_enforced');
  });

  it('should not write stdout when grimoire.json has no router key', () => {
    writeAgentDef(projectDir, 'grimoire.csharp-coder');
    writeGrimoireConfig(projectDir, { enforcement: true });

    start('grimoire.csharp-coder');

    expect(stdoutSpy).not.toHaveBeenCalled();
  });

  it('should not write stdout when agent_type is absent', () => {
    makeManifest(projectDir, { 'grimoire.csharp-coder': { approaches: [TDD] } });

    start();

    expect(stdoutSpy).not.toHaveBeenCalled();
    const entry = JSON.parse(readFileSync(logPath, 'utf-8').trim()) as Record<string, unknown>;
    expect(entry['agent_type']).toBe(null);
  });

  it('should not inject approaches whose entries are all malformed', () => {
    writeAgentDef(projectDir, 'grimoire.csharp-coder');
    makeManifest(projectDir, {
      'grimoire.csharp-coder': { approaches: [{ name: 'no-directive' }, { directive: 'no name' }] },
    });

    start('grimoire.csharp-coder');

    expect(stdoutSpy).not.toHaveBeenCalled();
  });
});

// =============================================================================
// runSubagentStop — telemetry only (no registry)
// =============================================================================

describe('runSubagentStop', () => {
  let projectDir: string;
  let logPath: string;

  let origProjectDirEnv: string | undefined;

  beforeEach(() => {
    projectDir = makeTmpDir('subagent-stop');
    logPath = join(projectDir, 'test-router.log');
    origProjectDirEnv = process.env['CLAUDE_PROJECT_DIR'];
    process.env['CLAUDE_PROJECT_DIR'] = projectDir;
  });

  afterEach(() => {
    process.env['CLAUDE_PROJECT_DIR'] = origProjectDirEnv;
    rmSync(projectDir, { recursive: true, force: true });
  });

  it('should write a SubagentStop telemetry log entry with stop_reason', () => {
    writeAgentDef(projectDir, 'grimoire.csharp-coder');

    // Act
    try {
      runSubagentStop(
        { session_id: 'session-abc', agent_id: 'agent-1', agent_type: 'grimoire.csharp-coder', stop_reason: 'success' },
        logPath,
      );
    } catch { /* process.exit(0) throws in vitest */ }

    // Assert
    expect(existsSync(logPath)).toBe(true);
    const entry = JSON.parse(readFileSync(logPath, 'utf-8').trim()) as Record<string, unknown>;
    expect(entry['hook_event']).toBe('SubagentStop');
    expect(entry['session_id']).toBe('session-abc');
    expect(entry['agent_id']).toBe('agent-1');
    expect(entry['agent_type']).toBe('grimoire.csharp-coder');
    expect(entry['stop_reason']).toBe('success');
  });

  it('should skip built-in agents that have no local definition file', () => {
    // Act — no .claude/agents/Plan.md exists
    try {
      runSubagentStop({ session_id: 'session-abc', agent_id: 'agent-1', agent_type: 'Plan', stop_reason: 'success' }, logPath);
    } catch { /* process.exit(0) throws in vitest */ }

    // Assert — nothing written
    expect(existsSync(logPath)).toBe(false);
  });

  it('should skip a stop it cannot attribute to a defined agent', () => {
    // Act — no agent_id/agent_type and no transcript to recover a type from,
    // so the run is unattributable (this is what produced empty agent_type rows)
    try {
      runSubagentStop({ session_id: 'session-abc' }, logPath);
    } catch { /* process.exit(0) throws in vitest */ }

    // Assert — nothing written
    expect(existsSync(logPath)).toBe(false);
  });
});

// =============================================================================
// runSubagentStop — transcript archiving
// =============================================================================

describe('runSubagentStop archiving', () => {
  let projectDir: string;
  let transcriptsDir: string;
  let logPath: string;
  let origProjectDirEnv: string | undefined;

  const SESSION_ID = 'sess-arch';
  const AGENT_ID = 'agentid1';

  beforeEach(() => {
    projectDir = makeTmpDir('subagent-archive');
    transcriptsDir = makeTmpDir('subagent-archive-src');
    logPath = join(projectDir, 'test-router.log');
    origProjectDirEnv = process.env['CLAUDE_PROJECT_DIR'];
    process.env['CLAUDE_PROJECT_DIR'] = projectDir;
  });

  afterEach(() => {
    process.env['CLAUDE_PROJECT_DIR'] = origProjectDirEnv;
    rmSync(projectDir, { recursive: true, force: true });
    rmSync(transcriptsDir, { recursive: true, force: true });
  });

  /**
   * Fake Claude Code transcript layout; returns the main transcript_path.
   * The meta.json's agentType is the resolved type (the stop payload's is empty
   * in production), so tests drive attribution through it.
   */
  function makeTranscripts(agentType = 'grimoire.csharp-coder', jsonl = '{"type":"assistant"}\n'): string {
    const transcriptPath = join(transcriptsDir, `${SESSION_ID}.jsonl`);
    writeFileSync(transcriptPath, '{}\n');
    const subDir = join(transcriptsDir, SESSION_ID, 'subagents');
    mkdirSync(subDir, { recursive: true });
    writeFileSync(join(subDir, `agent-${AGENT_ID}.jsonl`), jsonl);
    writeFileSync(join(subDir, `agent-${AGENT_ID}.meta.json`), JSON.stringify({ agentType }));
    return transcriptPath;
  }

  it('should archive the transcript and report archived: true in telemetry', () => {
    // Arrange
    writeAgentDef(projectDir, 'grimoire.csharp-coder');
    const transcriptPath = makeTranscripts('grimoire.csharp-coder', JSON.stringify({
      type: 'assistant',
      message: { content: [{ type: 'tool_use', name: 'Skill', input: { skill: 'grimoire.modern-typescript' } }] },
    }) + '\n');

    // Act
    try {
      runSubagentStop(
        {
          session_id: SESSION_ID,
          agent_id: AGENT_ID,
          agent_type: 'grimoire.csharp-coder',
          stop_reason: 'success',
          transcript_path: transcriptPath,
        },
        logPath,
      );
    } catch { /* process.exit(0) throws in vitest */ }

    // Assert
    const gzPath = join(
      projectDir, '.claude', 'grimoire', 'sessions',
      'grimoire.csharp-coder', SESSION_ID, `agent-${AGENT_ID}.jsonl.gz`,
    );
    expect(existsSync(gzPath)).toBe(true);
    const entry = JSON.parse(readFileSync(logPath, 'utf-8').trim()) as Record<string, unknown>;
    expect(entry['hook_event']).toBe('SubagentStop');
    expect(entry['archived']).toBe(true);
    expect(entry['skills_activated']).toEqual(['grimoire.modern-typescript']);
  });

  it('should log activated skills even when transcript archiving is disabled', () => {
    // Arrange
    writeAgentDef(projectDir, 'grimoire.csharp-coder');
    writeGrimoireConfig(projectDir, { insights: { archive: false } });
    const transcriptPath = makeTranscripts('grimoire.csharp-coder', JSON.stringify({
      type: 'assistant',
      message: { content: [{ type: 'tool_use', name: 'Skill', input: { skill: 'grimoire.testing' } }] },
    }) + '\n');

    // Act
    try {
      runSubagentStop(
        {
          session_id: SESSION_ID,
          agent_id: AGENT_ID,
          agent_type: 'grimoire.csharp-coder',
          stop_reason: 'success',
          transcript_path: transcriptPath,
        },
        logPath,
      );
    } catch { /* process.exit(0) throws in vitest */ }

    // Assert
    const entry = JSON.parse(readFileSync(logPath, 'utf-8').trim()) as Record<string, unknown>;
    expect(entry['archived']).toBe(false);
    expect(entry['skills_activated']).toEqual(['grimoire.testing']);
    expect(existsSync(join(projectDir, '.claude', 'grimoire'))).toBe(false);
  });

  it('should report archived: false when the transcript cannot be located', () => {
    // Arrange — no transcript_path/cwd in the payload
    writeAgentDef(projectDir, 'grimoire.csharp-coder');

    // Act
    try {
      runSubagentStop(
        { session_id: SESSION_ID, agent_id: AGENT_ID, agent_type: 'grimoire.csharp-coder', stop_reason: 'success' },
        logPath,
      );
    } catch { /* process.exit(0) throws in vitest */ }

    // Assert — telemetry still written, archive silently skipped
    const entry = JSON.parse(readFileSync(logPath, 'utf-8').trim()) as Record<string, unknown>;
    expect(entry['archived']).toBe(false);
    expect(existsSync(join(projectDir, '.claude', 'grimoire'))).toBe(false);
  });

  it('should not archive built-in agents', () => {
    // Arrange — meta resolves to a built-in type with no local agent def
    const transcriptPath = makeTranscripts('Explore');

    // Act
    try {
      runSubagentStop(
        {
          session_id: SESSION_ID,
          agent_id: AGENT_ID,
          agent_type: 'Explore',
          stop_reason: 'success',
          transcript_path: transcriptPath,
        },
        logPath,
      );
    } catch { /* process.exit(0) throws in vitest */ }

    // Assert — neither telemetry nor archive
    expect(existsSync(logPath)).toBe(false);
    expect(existsSync(join(projectDir, '.claude', 'grimoire'))).toBe(false);
  });
});

// =============================================================================
// runSubagentStop — approach adherence check
// =============================================================================

describe('runSubagentStop approach check', () => {
  let projectDir: string;
  let transcriptsDir: string;
  let logPath: string;
  let origProjectDirEnv: string | undefined;
  let stdoutSpy: MockInstance;

  const SESSION_ID = 'sess-check';
  const AGENT_ID = 'agentid2';
  const AGENT = 'grimoire.csharp-coder';
  const TDD = { name: 'tdd', directive: 'Tests first.', skill: 'grimoire.unit-testing-dotnet' };

  beforeEach(() => {
    projectDir = makeTmpDir('subagent-check');
    transcriptsDir = makeTmpDir('subagent-check-src');
    logPath = join(projectDir, 'test-router.log');
    origProjectDirEnv = process.env['CLAUDE_PROJECT_DIR'];
    process.env['CLAUDE_PROJECT_DIR'] = projectDir;
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    writeAgentDef(projectDir, AGENT);
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    process.env['CLAUDE_PROJECT_DIR'] = origProjectDirEnv;
    rmSync(projectDir, { recursive: true, force: true });
    rmSync(transcriptsDir, { recursive: true, force: true });
  });

  const toolUseLine = (name: string, input: Record<string, unknown> = {}): string =>
    JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name, input }] } });
  const editLine = (): string => toolUseLine('Edit', { file_path: 'a.cs' });
  const skillLine = (skill: string): string => toolUseLine('Skill', { skill });
  const markerLine = (): string =>
    JSON.stringify({
      type: 'user',
      message: { content: [{ type: 'text', text: `${APPROACH_CHECK_MARKER} check failed earlier` }] },
    });

  function makeTranscripts(lines: string[]): string {
    const transcriptPath = join(transcriptsDir, `${SESSION_ID}.jsonl`);
    writeFileSync(transcriptPath, '{}\n');
    const subDir = join(transcriptsDir, SESSION_ID, 'subagents');
    mkdirSync(subDir, { recursive: true });
    writeFileSync(join(subDir, `agent-${AGENT_ID}.jsonl`), lines.join('\n') + '\n');
    writeFileSync(join(subDir, `agent-${AGENT_ID}.meta.json`), JSON.stringify({ agentType: AGENT }));
    return transcriptPath;
  }

  function stop(opts: { transcriptPath?: string; stopReason?: string } = {}): void {
    try {
      runSubagentStop(
        {
          session_id: SESSION_ID,
          agent_id: AGENT_ID,
          agent_type: AGENT,
          stop_reason: opts.stopReason ?? 'success',
          ...(opts.transcriptPath ? { transcript_path: opts.transcriptPath } : {}),
        },
        logPath,
      );
    } catch { /* process.exit(0) throws in vitest */ }
  }

  function logEntry(): Record<string, unknown> {
    return JSON.parse(readFileSync(logPath, 'utf-8').trim()) as Record<string, unknown>;
  }

  function stdoutText(): string {
    return stdoutSpy.mock.calls.map((c) => String(c[0])).join('');
  }

  it('should bounce with feedback on stdout when edits were made and the bound skill was not invoked', () => {
    makeManifest(projectDir, { [AGENT]: { approaches: [TDD] } });
    const transcriptPath = makeTranscripts([editLine()]);

    stop({ transcriptPath });

    const output = JSON.parse(stdoutText()) as {
      hookSpecificOutput: { hookEventName: string; additionalContext: string };
    };
    expect(output.hookSpecificOutput.hookEventName).toBe('SubagentStop');
    expect(output.hookSpecificOutput.additionalContext.startsWith(APPROACH_CHECK_MARKER)).toBe(true);
    expect(output.hookSpecificOutput.additionalContext).toContain('grimoire.unit-testing-dotnet');
    const entry = logEntry();
    expect(entry['approach_check']).toBe('bounced');
    expect(entry['approach_violations']).toEqual(['tdd']);
  });

  it('should still archive the transcript when bouncing', () => {
    makeManifest(projectDir, { [AGENT]: { approaches: [TDD] } });
    const transcriptPath = makeTranscripts([editLine()]);

    stop({ transcriptPath });

    const gzPath = join(
      projectDir, '.claude', 'grimoire', 'sessions', AGENT, SESSION_ID, `agent-${AGENT_ID}.jsonl.gz`,
    );
    expect(existsSync(gzPath)).toBe(true);
    expect(logEntry()['archived']).toBe(true);
  });

  it('should log passed and not bounce when the bound skill was invoked', () => {
    makeManifest(projectDir, { [AGENT]: { approaches: [TDD] } });
    const transcriptPath = makeTranscripts([skillLine('grimoire.unit-testing-dotnet'), editLine()]);

    stop({ transcriptPath });

    expect(stdoutSpy).not.toHaveBeenCalled();
    const entry = logEntry();
    expect(entry['approach_check']).toBe('passed');
    expect(entry['skills_activated']).toEqual(['grimoire.unit-testing-dotnet']);
  });

  it('should not bounce a second time when the marker is already in the transcript', () => {
    makeManifest(projectDir, { [AGENT]: { approaches: [TDD] } });
    const transcriptPath = makeTranscripts([editLine(), markerLine()]);

    stop({ transcriptPath });

    expect(stdoutSpy).not.toHaveBeenCalled();
    expect(logEntry()['approach_check']).toBe('skipped');
  });

  it('should not bounce when stop_reason is cancelled', () => {
    makeManifest(projectDir, { [AGENT]: { approaches: [TDD] } });
    const transcriptPath = makeTranscripts([editLine()]);

    stop({ transcriptPath, stopReason: 'cancelled' });

    expect(stdoutSpy).not.toHaveBeenCalled();
    expect(logEntry()['approach_check']).toBe('skipped');
  });

  it('should not bounce when stop_reason is error', () => {
    makeManifest(projectDir, { [AGENT]: { approaches: [TDD] } });
    const transcriptPath = makeTranscripts([editLine()]);

    stop({ transcriptPath, stopReason: 'error' });

    expect(stdoutSpy).not.toHaveBeenCalled();
    expect(logEntry()['approach_check']).toBe('skipped');
  });

  it('should fail open when the transcript cannot be located', () => {
    makeManifest(projectDir, { [AGENT]: { approaches: [TDD] } });

    stop();

    expect(stdoutSpy).not.toHaveBeenCalled();
    const entry = logEntry();
    expect(entry['approach_check']).toBe('skipped');
    expect(entry['archived']).toBe(false);
  });

  it('should not bounce for directive-only approaches', () => {
    makeManifest(projectDir, { [AGENT]: { approaches: [{ name: 'docs-first', directive: 'Docs first.' }] } });
    const transcriptPath = makeTranscripts([editLine()]);

    stop({ transcriptPath });

    expect(stdoutSpy).not.toHaveBeenCalled();
    expect(logEntry()['approach_check']).toBe('skipped');
  });

  it('should not add approach_check when the agent has no approaches', () => {
    makeManifest(projectDir, { [AGENT]: {} });
    const transcriptPath = makeTranscripts([editLine()]);

    stop({ transcriptPath });

    expect(stdoutSpy).not.toHaveBeenCalled();
    const entry = logEntry();
    expect(entry).not.toHaveProperty('approach_check');
    expect(entry).not.toHaveProperty('approach_violations');
  });

  it('should not bounce when the run made no edits', () => {
    makeManifest(projectDir, { [AGENT]: { approaches: [TDD] } });
    const transcriptPath = makeTranscripts([toolUseLine('Read', { file_path: 'a.cs' })]);

    stop({ transcriptPath });

    expect(stdoutSpy).not.toHaveBeenCalled();
    expect(logEntry()['approach_check']).toBe('skipped');
  });
});
