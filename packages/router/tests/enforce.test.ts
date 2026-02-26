import { describe, it, expect, beforeEach, afterEach } from 'vitest';
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
  agents: Record<string, { file_patterns?: string[]; enforce?: boolean }>,
): void {
  const claudeDir = join(projectDir, '.claude');
  mkdirSync(claudeDir, { recursive: true });
  writeFileSync(
    join(claudeDir, 'skills-manifest.json'),
    JSON.stringify({
      version: '2.0.0',
      config: {
        weights: { keywords: 1.0, file_extensions: 1.5, patterns: 2.0, file_paths: 2.5 },
        activation_threshold: 3.0,
      },
      skills: [],
      agents,
    }),
  );
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
  let manifestPath: string;
  let registryPath: string;

  beforeEach(() => {
    projectDir = makeTmpDir('eval');
    manifestPath = join(projectDir, '.claude', 'skills-manifest.json');
    registryPath = join(projectDir, '.claude', 'hooks', '.grimoire-subagents.json');
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  it('should allow non-editing tools', () => {
    // Arrange
    makeManifest(projectDir, {
      'grimoire.typescript-coder': { file_patterns: ['*.ts'], enforce: true },
    });
    const input = makePreToolUseInput('Read', 'src/index.ts');

    // Act
    const result = evaluateEnforce(input, manifestPath, registryPath);

    // Assert
    expect(result.action).toBe('allow');
  });

  it('should allow when manifest is missing', () => {
    // Arrange
    const input = makePreToolUseInput('Edit', 'src/index.ts');

    // Act
    const result = evaluateEnforce(input, '/nonexistent/manifest.json', registryPath);

    // Assert
    expect(result.action).toBe('allow');
  });

  it('should allow when no agents have enforce: true', () => {
    // Arrange
    makeManifest(projectDir, {
      'grimoire.typescript-coder': { file_patterns: ['*.ts'], enforce: false },
    });
    const input = makePreToolUseInput('Edit', 'src/index.ts');

    // Act
    const result = evaluateEnforce(input, manifestPath, registryPath);

    // Assert
    expect(result.action).toBe('allow');
  });

  it('should allow when no agents section exists', () => {
    // Arrange
    mkdirSync(join(projectDir, '.claude'), { recursive: true });
    writeFileSync(
      manifestPath,
      JSON.stringify({
        version: '2.0.0',
        config: {
          weights: { keywords: 1, file_extensions: 1.5, patterns: 2, file_paths: 2.5 },
          activation_threshold: 3,
        },
        skills: [],
      }),
    );
    const input = makePreToolUseInput('Edit', 'src/index.ts');

    // Act
    const result = evaluateEnforce(input, manifestPath, registryPath);

    // Assert
    expect(result.action).toBe('allow');
  });

  it('should allow when session_id is in registry (subagent bypass)', () => {
    // Arrange
    makeManifest(projectDir, {
      'grimoire.typescript-coder': { file_patterns: ['*.ts'], enforce: true },
    });
    makeRegistry(registryPath, ['test-session']);
    const input = makePreToolUseInput('Edit', 'src/index.ts', 'test-session');

    // Act
    const result = evaluateEnforce(input, manifestPath, registryPath);

    // Assert
    expect(result.action).toBe('allow');
  });

  it('should block when file matches enforced agent pattern', () => {
    // Arrange
    makeManifest(projectDir, {
      'grimoire.typescript-coder': { file_patterns: ['*.ts'], enforce: true },
    });
    const input = makePreToolUseInput('Edit', 'src/utils.ts');

    // Act
    const result = evaluateEnforce(input, manifestPath, registryPath);

    // Assert
    expect(result.action).toBe('block');
    if (result.action === 'block') {
      expect(result.agents).toContain('grimoire.typescript-coder');
      expect(result.filePath).toBe('src/utils.ts');
    }
  });

  it('should block on Write tool', () => {
    // Arrange
    makeManifest(projectDir, {
      'grimoire.typescript-coder': { file_patterns: ['*.ts'], enforce: true },
    });
    const input = makePreToolUseInput('Write', 'new-file.ts');

    // Act
    const result = evaluateEnforce(input, manifestPath, registryPath);

    // Assert
    expect(result.action).toBe('block');
  });

  it('should block on MultiEdit tool', () => {
    // Arrange
    makeManifest(projectDir, {
      'grimoire.typescript-coder': { file_patterns: ['*.ts'], enforce: true },
    });
    const input = makePreToolUseInput('MultiEdit', 'src/api.ts');

    // Act
    const result = evaluateEnforce(input, manifestPath, registryPath);

    // Assert
    expect(result.action).toBe('block');
  });

  it('should allow when file does not match any pattern', () => {
    // Arrange
    makeManifest(projectDir, {
      'grimoire.typescript-coder': { file_patterns: ['*.ts'], enforce: true },
    });
    const input = makePreToolUseInput('Edit', 'README.md');

    // Act
    const result = evaluateEnforce(input, manifestPath, registryPath);

    // Assert
    expect(result.action).toBe('allow');
  });

  it('should list all matching agents when multiple enforce the same file', () => {
    // Arrange
    makeManifest(projectDir, {
      'grimoire.csharp-coder': { file_patterns: ['*.cs'], enforce: true },
      'grimoire.dotnet-architect': { file_patterns: ['*.cs', '*.csproj'], enforce: true },
    });
    const input = makePreToolUseInput('Edit', 'src/MyService.cs');

    // Act
    const result = evaluateEnforce(input, manifestPath, registryPath);

    // Assert
    expect(result.action).toBe('block');
    if (result.action === 'block') {
      expect(result.agents).toHaveLength(2);
      expect(result.agents).toContain('grimoire.csharp-coder');
      expect(result.agents).toContain('grimoire.dotnet-architect');
    }
  });

  it('should not block for agent with enforce: true but empty file_patterns', () => {
    // Arrange
    makeManifest(projectDir, {
      'grimoire.typescript-coder': { file_patterns: [], enforce: true },
    });
    const input = makePreToolUseInput('Edit', 'src/index.ts');

    // Act
    const result = evaluateEnforce(input, manifestPath, registryPath);

    // Assert
    expect(result.action).toBe('allow');
  });

  it('should match by basename glob even for deeply nested path', () => {
    // Arrange
    makeManifest(projectDir, {
      'grimoire.typescript-coder': { file_patterns: ['*.ts'], enforce: true },
    });
    const input = makePreToolUseInput('Edit', 'packages/core/src/deep/util.ts');

    // Act
    const result = evaluateEnforce(input, manifestPath, registryPath);

    // Assert
    expect(result.action).toBe('block');
  });

  it('should block when registry contains a different session', () => {
    // Arrange
    makeManifest(projectDir, {
      'grimoire.typescript-coder': { file_patterns: ['*.ts'], enforce: true },
    });
    makeRegistry(registryPath, ['other-session']);
    const input = makePreToolUseInput('Edit', 'src/index.ts', 'my-session');

    // Act
    const result = evaluateEnforce(input, manifestPath, registryPath);

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
    makeManifest(projectDir, {
      'grimoire.typescript-coder': { file_patterns: ['*.ts'], enforce: true },
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

  it('should not write a log entry when file does not match (allow path)', () => {
    // Arrange
    makeManifest(projectDir, {
      'grimoire.typescript-coder': { file_patterns: ['*.ts'], enforce: true },
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
    expect(existsSync(logPath)).toBe(false);
  });

  it('should log only the basename, not the full path', () => {
    // Arrange
    makeManifest(projectDir, {
      'grimoire.typescript-coder': { file_patterns: ['*.ts'], enforce: true },
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
    makeManifest(projectDir, {
      'grimoire.csharp-coder': { file_patterns: ['*.cs'], enforce: true },
      'grimoire.dotnet-architect': { file_patterns: ['*.cs', '*.csproj'], enforce: true },
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
