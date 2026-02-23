import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  readManifest,
  writeManifest,
  setEnforce,
  readAgentMeta,
  hasEnforcePreToolUseHook,
  hasSubagentHook,
  ensureEnforceHooks,
  removeEnforceHooks,
} from '../src/enforce.js';
import type { SkillsManifest } from '../src/enforce.js';

function makeTmpDir(prefix: string): string {
  const raw = join(tmpdir(), `grimoire-enforce-${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(raw, { recursive: true });
  return realpathSync(raw);
}

function readJson(filePath: string): unknown {
  return JSON.parse(readFileSync(filePath, 'utf-8'));
}

function makeManifest(projectDir: string, agents: Record<string, { file_patterns?: string[]; enforce?: boolean }>): void {
  const claudeDir = join(projectDir, '.claude');
  mkdirSync(claudeDir, { recursive: true });
  writeFileSync(
    join(claudeDir, 'skills-manifest.json'),
    JSON.stringify({
      version: '2.0.0',
      config: {},
      skills: [],
      agents,
    }),
  );
}

function makeSettings(projectDir: string, settings: Record<string, unknown>): void {
  const claudeDir = join(projectDir, '.claude');
  mkdirSync(claudeDir, { recursive: true });
  writeFileSync(join(claudeDir, 'settings.json'), JSON.stringify(settings, null, 2));
}

// =============================================================================
// readManifest / writeManifest
// =============================================================================

describe('readManifest', () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = makeTmpDir('read-manifest');
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  it('should read existing manifest', () => {
    // Arrange
    makeManifest(projectDir, { 'grimoire.typescript-coder': { file_patterns: ['*.ts'] } });

    // Act
    const manifest = readManifest(projectDir);

    // Assert
    expect(manifest.version).toBe('2.0.0');
    expect(manifest.agents['grimoire.typescript-coder']).toBeDefined();
  });

  it('should throw when manifest does not exist', () => {
    // Arrange — empty projectDir, no manifest written

    // Act + Assert
    expect(() => readManifest(projectDir)).toThrow(/not found/i);
  });
});

describe('writeManifest', () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = makeTmpDir('write-manifest');
    makeManifest(projectDir, {});
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  it('should persist manifest changes', () => {
    // Arrange
    const manifest = readManifest(projectDir);
    manifest.agents['grimoire.typescript-coder'] = { file_patterns: ['*.ts'], enforce: true };

    // Act
    writeManifest(projectDir, manifest);

    // Assert
    const loaded = readManifest(projectDir);
    expect(loaded.agents['grimoire.typescript-coder']?.enforce).toBe(true);
  });
});

// =============================================================================
// setEnforce
// =============================================================================

describe('setEnforce', () => {
  it('should set enforce: true for agent with file_patterns', () => {
    // Arrange
    const manifest: SkillsManifest = {
      version: '2.0.0',
      config: {},
      skills: [],
      agents: {
        'grimoire.typescript-coder': { file_patterns: ['*.ts'], enforce: false },
      },
    };

    // Act
    setEnforce(manifest, 'grimoire.typescript-coder', true);

    // Assert
    expect(manifest.agents['grimoire.typescript-coder']?.enforce).toBe(true);
  });

  it('should set enforce: false for agent', () => {
    // Arrange
    const manifest: SkillsManifest = {
      version: '2.0.0',
      config: {},
      skills: [],
      agents: {
        'grimoire.typescript-coder': { file_patterns: ['*.ts'], enforce: true },
      },
    };

    // Act
    setEnforce(manifest, 'grimoire.typescript-coder', false);

    // Assert
    expect(manifest.agents['grimoire.typescript-coder']?.enforce).toBe(false);
  });

  it('should throw when agent is not in manifest', () => {
    // Arrange
    const manifest: SkillsManifest = {
      version: '2.0.0',
      config: {},
      skills: [],
      agents: {},
    };

    // Act + Assert
    expect(() => setEnforce(manifest, 'nonexistent', true)).toThrow(/not found/i);
  });

  it('should throw when enabling enforce on agent with no file_patterns', () => {
    // Arrange
    const manifest: SkillsManifest = {
      version: '2.0.0',
      config: {},
      skills: [],
      agents: { 'grimoire.fact-checker': {} },
    };

    // Act + Assert
    expect(() => setEnforce(manifest, 'grimoire.fact-checker', true)).toThrow(/file_patterns/i);
  });

  it('should allow disabling enforce even with no file_patterns', () => {
    // Arrange
    const manifest: SkillsManifest = {
      version: '2.0.0',
      config: {},
      skills: [],
      agents: { 'grimoire.fact-checker': { enforce: true } },
    };

    // Act + Assert
    expect(() => setEnforce(manifest, 'grimoire.fact-checker', false)).not.toThrow();
    expect(manifest.agents['grimoire.fact-checker']?.enforce).toBe(false);
  });
});

// =============================================================================
// readAgentMeta
// =============================================================================

describe('readAgentMeta', () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = makeTmpDir('agent-meta');
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  it('should parse name and description from frontmatter', () => {
    // Arrange
    const agentPath = join(projectDir, 'test-agent.md');
    writeFileSync(
      agentPath,
      `---\nname: grimoire.typescript-coder\ndescription: "TypeScript specialist"\n---\n\n# Content`,
    );

    // Act
    const meta = readAgentMeta(agentPath);

    // Assert
    expect(meta.name).toBe('grimoire.typescript-coder');
    expect(meta.description).toBe('TypeScript specialist');
  });

  it('should return empty strings for missing file', () => {
    // Arrange — nonexistent path

    // Act
    const meta = readAgentMeta('/nonexistent/agent.md');

    // Assert
    expect(meta.name).toBe('');
    expect(meta.description).toBe('');
  });

  it('should return empty strings when no frontmatter', () => {
    // Arrange
    const agentPath = join(projectDir, 'no-fm.md');
    writeFileSync(agentPath, '# No frontmatter here');

    // Act
    const meta = readAgentMeta(agentPath);

    // Assert
    expect(meta.name).toBe('');
    expect(meta.description).toBe('');
  });
});

// =============================================================================
// hasEnforcePreToolUseHook / hasSubagentHook
// =============================================================================

describe('hasEnforcePreToolUseHook', () => {
  it('should return true when --enforce hook exists', () => {
    // Arrange
    const entries = [
      { matcher: 'Edit|Write|MultiEdit', hooks: [{ type: 'command', command: 'npx @grimoire-cc/router --enforce' }] },
    ];

    // Act + Assert
    expect(hasEnforcePreToolUseHook(entries)).toBe(true);
  });

  it('should return false when no enforce hook', () => {
    // Arrange
    const entries = [
      { matcher: '', hooks: [{ type: 'command', command: 'npx @grimoire-cc/router' }] },
    ];

    // Act + Assert
    expect(hasEnforcePreToolUseHook(entries)).toBe(false);
  });

  it('should return false for empty entries', () => {
    // Arrange — empty array

    // Act + Assert
    expect(hasEnforcePreToolUseHook([])).toBe(false);
  });
});

describe('hasSubagentHook', () => {
  it('should return true when subagent-start hook exists for agent', () => {
    // Arrange
    const entries = [
      {
        matcher: 'grimoire.typescript-coder',
        hooks: [{ type: 'command', command: 'npx @grimoire-cc/router --subagent-start' }],
      },
    ];

    // Act + Assert
    expect(hasSubagentHook(entries, 'grimoire.typescript-coder', '--subagent-start')).toBe(true);
  });

  it('should return false for different agent name', () => {
    // Arrange
    const entries = [
      {
        matcher: 'grimoire.typescript-coder',
        hooks: [{ type: 'command', command: 'npx @grimoire-cc/router --subagent-start' }],
      },
    ];

    // Act + Assert
    expect(hasSubagentHook(entries, 'grimoire.vue3-coder', '--subagent-start')).toBe(false);
  });

  it('should return false for different flag', () => {
    // Arrange
    const entries = [
      {
        matcher: 'grimoire.typescript-coder',
        hooks: [{ type: 'command', command: 'npx @grimoire-cc/router --subagent-start' }],
      },
    ];

    // Act + Assert
    expect(hasSubagentHook(entries, 'grimoire.typescript-coder', '--subagent-stop')).toBe(false);
  });
});

// =============================================================================
// ensureEnforceHooks
// =============================================================================

describe('ensureEnforceHooks', () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = makeTmpDir('ensure-hooks');
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  it('should create settings.json with enforce hooks on fresh project', () => {
    // Arrange — fresh projectDir with no settings.json

    // Act
    ensureEnforceHooks(projectDir, ['grimoire.typescript-coder']);

    // Assert
    const settings = readJson(join(projectDir, '.claude', 'settings.json')) as Record<string, unknown>;
    const hooks = settings['hooks'] as Record<string, unknown[]>;

    expect(hooks['PreToolUse']).toHaveLength(1);
    const preToolEntry = (hooks['PreToolUse'] as Array<{ matcher: string; hooks: Array<{ command: string }> }>)[0];
    expect(preToolEntry!.hooks[0]!.command).toContain('--enforce');

    expect(hooks['SubagentStart']).toHaveLength(1);
    const startEntry = (hooks['SubagentStart'] as Array<{ matcher: string; hooks: Array<{ command: string }> }>)[0];
    expect(startEntry!.matcher).toBe('grimoire.typescript-coder');
    expect(startEntry!.hooks[0]!.command).toContain('--subagent-start');

    expect(hooks['SubagentStop']).toHaveLength(1);
    const stopEntry = (hooks['SubagentStop'] as Array<{ matcher: string; hooks: Array<{ command: string }> }>)[0];
    expect(stopEntry!.matcher).toBe('grimoire.typescript-coder');
    expect(stopEntry!.hooks[0]!.command).toContain('--subagent-stop');
  });

  it('should add SubagentStart/Stop entries for multiple agents', () => {
    // Arrange — fresh projectDir

    // Act
    ensureEnforceHooks(projectDir, ['grimoire.typescript-coder', 'grimoire.vue3-coder']);

    // Assert
    const settings = readJson(join(projectDir, '.claude', 'settings.json')) as Record<string, unknown>;
    const hooks = settings['hooks'] as Record<string, Array<{ matcher: string }>>;

    const startMatchers = hooks['SubagentStart']!.map((e) => e.matcher);
    expect(startMatchers).toContain('grimoire.typescript-coder');
    expect(startMatchers).toContain('grimoire.vue3-coder');
  });

  it('should not duplicate PreToolUse enforce hook on re-run', () => {
    // Arrange
    ensureEnforceHooks(projectDir, ['grimoire.typescript-coder']);

    // Act
    ensureEnforceHooks(projectDir, ['grimoire.typescript-coder', 'grimoire.vue3-coder']);

    // Assert
    const settings = readJson(join(projectDir, '.claude', 'settings.json')) as Record<string, unknown>;
    const hooks = settings['hooks'] as Record<string, unknown[]>;

    expect(hooks['PreToolUse']).toHaveLength(1);
  });

  it('should not duplicate SubagentStart entry for same agent on re-run', () => {
    // Arrange
    ensureEnforceHooks(projectDir, ['grimoire.typescript-coder']);

    // Act
    ensureEnforceHooks(projectDir, ['grimoire.typescript-coder']);

    // Assert
    const settings = readJson(join(projectDir, '.claude', 'settings.json')) as Record<string, unknown>;
    const hooks = settings['hooks'] as Record<string, Array<{ matcher: string }>>;

    const tsEntries = hooks['SubagentStart']!.filter((e) => e.matcher === 'grimoire.typescript-coder');
    expect(tsEntries).toHaveLength(1);
  });

  it('should preserve existing non-enforce hooks', () => {
    // Arrange
    makeSettings(projectDir, {
      hooks: {
        UserPromptSubmit: [{ matcher: '', hooks: [{ type: 'command', command: 'npx @grimoire-cc/router' }] }],
      },
    });

    // Act
    ensureEnforceHooks(projectDir, ['grimoire.typescript-coder']);

    // Assert
    const settings = readJson(join(projectDir, '.claude', 'settings.json')) as Record<string, unknown>;
    const hooks = settings['hooks'] as Record<string, unknown[]>;

    expect(hooks['UserPromptSubmit']).toHaveLength(1);
  });
});

// =============================================================================
// removeEnforceHooks
// =============================================================================

describe('removeEnforceHooks', () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = makeTmpDir('remove-hooks');
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  it('should remove all enforcement hook entries', () => {
    // Arrange
    ensureEnforceHooks(projectDir, ['grimoire.typescript-coder']);

    // Act
    removeEnforceHooks(projectDir);

    // Assert
    const settings = readJson(join(projectDir, '.claude', 'settings.json')) as Record<string, unknown>;
    const hooks = (settings['hooks'] ?? {}) as Record<string, unknown>;

    expect(hooks['PreToolUse']).toBeUndefined();
    expect(hooks['SubagentStart']).toBeUndefined();
    expect(hooks['SubagentStop']).toBeUndefined();
  });

  it('should preserve non-enforce hooks when removing', () => {
    // Arrange
    makeSettings(projectDir, {
      hooks: {
        UserPromptSubmit: [{ matcher: '', hooks: [{ type: 'command', command: 'npx @grimoire-cc/router' }] }],
        PreToolUse: [
          { matcher: 'Edit|Write', hooks: [{ type: 'command', command: 'npx @grimoire-cc/router' }] },
          { matcher: 'Edit|Write|MultiEdit', hooks: [{ type: 'command', command: 'npx @grimoire-cc/router --enforce' }] },
        ],
        SubagentStart: [{ matcher: 'grimoire.typescript-coder', hooks: [{ type: 'command', command: 'npx @grimoire-cc/router --subagent-start' }] }],
      },
    });

    // Act
    removeEnforceHooks(projectDir);

    // Assert
    const settings = readJson(join(projectDir, '.claude', 'settings.json')) as Record<string, unknown>;
    const hooks = settings['hooks'] as Record<string, Array<{ hooks: Array<{ command: string }> }>>;

    expect(hooks['PreToolUse']).toHaveLength(1);
    expect(hooks['PreToolUse']![0]!.hooks[0]!.command).not.toContain('--enforce');
    expect(hooks['UserPromptSubmit']).toHaveLength(1);
    expect(hooks['SubagentStart']).toBeUndefined();
  });

  it('should be a no-op when settings.json does not exist', () => {
    // Arrange — fresh projectDir with no settings.json

    // Act + Assert
    expect(() => removeEnforceHooks(projectDir)).not.toThrow();
  });

  it('should be a no-op when no enforce hooks present', () => {
    // Arrange
    makeSettings(projectDir, {
      hooks: {
        UserPromptSubmit: [{ matcher: '', hooks: [{ type: 'command', command: 'npx @grimoire-cc/router' }] }],
      },
    });

    // Act + Assert
    expect(() => removeEnforceHooks(projectDir)).not.toThrow();

    const settings = readJson(join(projectDir, '.claude', 'settings.json')) as Record<string, unknown>;
    const hooks = settings['hooks'] as Record<string, unknown[]>;
    expect(hooks['UserPromptSubmit']).toHaveLength(1);
  });
});
