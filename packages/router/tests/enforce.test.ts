import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { evaluateEnforce, runEnforce, runSubagentStart, runSubagentStop } from '../src/enforce.js';
import type { PreToolUseInput } from '../src/types.js';

function makeTmpDir(prefix: string): string {
  const raw = join(tmpdir(), `enforce-test-${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(raw, { recursive: true });
  return realpathSync(raw);
}

function readJson(filePath: string): unknown {
  return JSON.parse(readFileSync(filePath, 'utf-8'));
}

function makeManifest(
  projectDir: string,
  agents: Record<string, { file_patterns?: string[] }>,
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

function writeGrimoireConfig(projectDir: string, config: { enforcement?: boolean }): void {
  const claudeDir = join(projectDir, '.claude');
  mkdirSync(claudeDir, { recursive: true });
  writeFileSync(join(claudeDir, 'grimoire.json'), JSON.stringify(config));
}

function makeRegistry(registryPath: string, sessions: string[]): void {
  mkdirSync(join(registryPath, '..'), { recursive: true });
  writeFileSync(registryPath, JSON.stringify({ sessions }, null, 2) + '\n');
}

function makePreToolUseInput(
  toolName: 'Edit' | 'Write' | 'MultiEdit' | 'Read',
  filePath: string,
  sessionId = 'test-session',
): PreToolUseInput {
  return {
    session_id: sessionId,
    hook_event_name: 'PreToolUse',
    tool_name: toolName as 'Edit' | 'Write' | 'MultiEdit',
    tool_use_id: 'tool-123',
    tool_input: { file_path: filePath },
  };
}

// =============================================================================
// evaluateEnforce
// =============================================================================

describe('evaluateEnforce', () => {
  let projectDir: string;
  let registryPath: string;

  beforeEach(() => {
    projectDir = makeTmpDir('eval');
    registryPath = join(projectDir, '.claude', 'hooks', '.grimoire-subagents.json');
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
    const result = evaluateEnforce(input, registryPath, projectDir);

    // Assert
    expect(result.action).toBe('allow');
  });

  it('should allow when router config is missing from grimoire.json', () => {
    // Arrange — grimoire.json has enforcement but no router key
    writeGrimoireConfig(projectDir, { enforcement: true });
    const input = makePreToolUseInput('Edit', 'src/index.ts');

    // Act
    const result = evaluateEnforce(input, registryPath, projectDir);

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
    const result = evaluateEnforce(input, registryPath, projectDir);

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
    const result = evaluateEnforce(input, registryPath, projectDir);

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
    const result = evaluateEnforce(input, registryPath, projectDir);

    // Assert
    expect(result.action).toBe('allow');
  });

  it('should allow when session_id is in registry (subagent bypass)', () => {
    // Arrange
    writeGrimoireConfig(projectDir, { enforcement: true });
    makeManifest(projectDir, {
      'grimoire.typescript-coder': { file_patterns: ['*.ts'] },
    });
    makeRegistry(registryPath, ['test-session']);
    const input = makePreToolUseInput('Edit', 'src/index.ts', 'test-session');

    // Act
    const result = evaluateEnforce(input, registryPath, projectDir);

    // Assert
    expect(result.action).toBe('allow');
  });

  it('should block when file matches agent pattern and enforcement is enabled', () => {
    // Arrange
    writeGrimoireConfig(projectDir, { enforcement: true });
    makeManifest(projectDir, {
      'grimoire.typescript-coder': { file_patterns: ['*.ts'] },
    });
    const input = makePreToolUseInput('Edit', 'src/utils.ts');

    // Act
    const result = evaluateEnforce(input, registryPath, projectDir);

    // Assert
    expect(result.action).toBe('block');
    if (result.action === 'block') {
      expect(result.agents).toContain('grimoire.typescript-coder');
      expect(result.filePath).toBe('src/utils.ts');
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
    const result = evaluateEnforce(input, registryPath, projectDir);

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
    const result = evaluateEnforce(input, registryPath, projectDir);

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
    const result = evaluateEnforce(input, registryPath, projectDir);

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
    const result = evaluateEnforce(input, registryPath, projectDir);

    // Assert
    expect(result.action).toBe('block');
    if (result.action === 'block') {
      expect(result.agents).toHaveLength(2);
      expect(result.agents).toContain('grimoire.csharp-coder');
      expect(result.agents).toContain('grimoire.dotnet-architect');
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
    const result = evaluateEnforce(input, registryPath, projectDir);

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
    const result = evaluateEnforce(input, registryPath, projectDir);

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
    const result = evaluateEnforce(input, registryPath, projectDir);

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
    const result = evaluateEnforce(input, registryPath, projectDir);

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
    const result = evaluateEnforce(input, registryPath, projectDir);

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
    const result = evaluateEnforce(input, registryPath, 'C:\\Users\\AKochev\\project', projectDir);

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
    const result = evaluateEnforce(input, registryPath, 'C:\\Projects', projectDir);

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
    const result = evaluateEnforce(input, registryPath, 'C:\\Users\\Dev\\project', projectDir);

    // Assert
    expect(result.action).toBe('block');
    if (result.action === 'block') {
      expect(result.agents).toContain('grimoire.typescript-coder');
    }
  });

  it('should block when registry contains a different session', () => {
    // Arrange
    writeGrimoireConfig(projectDir, { enforcement: true });
    makeManifest(projectDir, {
      'grimoire.typescript-coder': { file_patterns: ['*.ts'] },
    });
    makeRegistry(registryPath, ['other-session']);
    const input = makePreToolUseInput('Edit', 'src/index.ts', 'my-session');

    // Act
    const result = evaluateEnforce(input, registryPath, projectDir);

    // Assert
    expect(result.action).toBe('block');
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
    expect(entry['file_basename']).toBe('utils.ts');
    expect(entry['blocking_agents']).toContain('grimoire.typescript-coder');
    expect(typeof entry['timestamp']).toBe('string');
  });

  it('should write an allow log entry with debug info when file does not match', () => {
    // Arrange
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
// runSubagentStart
// =============================================================================

describe('runSubagentStart', () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = makeTmpDir('subagent-start');
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  it('should create registry with session_id when file does not exist', () => {
    // Arrange
    const registryPath = join(projectDir, '.grimoire-subagents.json');

    // Act
    try {
      runSubagentStart({ session_id: 'session-abc' }, registryPath);
    } catch {
      // process.exit(0) throws in vitest
    }

    // Assert
    expect(existsSync(registryPath)).toBe(true);
    const data = readJson(registryPath) as { sessions: string[] };
    expect(data.sessions).toContain('session-abc');
  });

  it('should append session_id to existing registry', () => {
    // Arrange
    const registryPath = join(projectDir, '.grimoire-subagents.json');
    writeFileSync(registryPath, JSON.stringify({ sessions: ['existing-session'] }));

    // Act
    try {
      runSubagentStart({ session_id: 'new-session' }, registryPath);
    } catch {
      // process.exit(0) throws in vitest
    }

    // Assert
    const data = readJson(registryPath) as { sessions: string[] };
    expect(data.sessions).toContain('existing-session');
    expect(data.sessions).toContain('new-session');
  });

  it('should not duplicate session_id when called twice (idempotent)', () => {
    // Arrange
    const registryPath = join(projectDir, '.grimoire-subagents.json');
    writeFileSync(registryPath, JSON.stringify({ sessions: ['session-abc'] }));

    // Act
    try {
      runSubagentStart({ session_id: 'session-abc' }, registryPath);
    } catch {
      // process.exit(0) throws in vitest
    }

    // Assert
    const data = readJson(registryPath) as { sessions: string[] };
    expect(data.sessions.filter((s) => s === 'session-abc')).toHaveLength(1);
  });

  it('should only register the session and never write to stdout (skill injection is native via skills frontmatter)', () => {
    // Arrange — agent with skills in frontmatter; injection must NOT happen anyway
    process.env['CLAUDE_PROJECT_DIR'] = projectDir;
    const registryPath = join(projectDir, '.grimoire-subagents.json');
    const agentsDir = join(projectDir, '.claude', 'agents');
    mkdirSync(agentsDir, { recursive: true });
    writeFileSync(join(agentsDir, 'grimoire.csharp-coder.md'), [
      '---',
      'name: grimoire.csharp-coder',
      'skills:',
      '  - skill-a',
      '---',
      '',
      'Agent body.',
    ].join('\n'));
    const skillDir = join(projectDir, '.claude', 'skills', 'skill-a');
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, 'SKILL.md'), '---\nname: skill-a\ndescription: test\n---\nSkill A content.');

    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    // Act
    try {
      runSubagentStart({ session_id: 'session-abc' }, registryPath);
    } catch {
      // process.exit(0) throws in vitest
    }

    // Assert — session registered, no stdout output
    const data = readJson(registryPath) as { sessions: string[] };
    expect(data.sessions).toContain('session-abc');
    expect(writeSpy).not.toHaveBeenCalled();
    writeSpy.mockRestore();
    delete process.env['CLAUDE_PROJECT_DIR'];
  });
});

// =============================================================================
// runSubagentStop
// =============================================================================

describe('runSubagentStop', () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = makeTmpDir('subagent-stop');
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  it('should remove session_id from registry', () => {
    // Arrange
    const registryPath = join(projectDir, '.grimoire-subagents.json');
    writeFileSync(registryPath, JSON.stringify({ sessions: ['session-abc', 'session-xyz'] }));

    // Act
    try {
      runSubagentStop({ session_id: 'session-abc' }, registryPath);
    } catch {
      // process.exit(0) throws in vitest
    }

    // Assert
    const data = readJson(registryPath) as { sessions: string[] };
    expect(data.sessions).not.toContain('session-abc');
    expect(data.sessions).toContain('session-xyz');
  });

  it('should be a no-op when session_id is not in registry', () => {
    // Arrange
    const registryPath = join(projectDir, '.grimoire-subagents.json');
    writeFileSync(registryPath, JSON.stringify({ sessions: ['other-session'] }));

    // Act
    try {
      runSubagentStop({ session_id: 'nonexistent' }, registryPath);
    } catch {
      // process.exit(0) throws in vitest
    }

    // Assert
    const data = readJson(registryPath) as { sessions: string[] };
    expect(data.sessions).toContain('other-session');
  });

  it('should be a no-op when registry file does not exist', () => {
    // Arrange
    const registryPath = join(projectDir, '.grimoire-subagents.json');

    // Act + Assert
    expect(() => {
      try {
        runSubagentStop({ session_id: 'session-abc' }, registryPath);
      } catch {
        // process.exit(0) throws in vitest
      }
    }).not.toThrow();
  });
});
