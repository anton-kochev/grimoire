import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  readManifest,
  writeManifest,
  readAgentMeta,
  hasEnforcePreToolUseHook,
  hasSubagentHook,
  ensureEnforceHooks,
  ensureSubagentHooks,
  removeEnforceHooks,
  removeSubagentHooksFor,
  agentsWithPatterns,
  agentsWithApproaches,
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
        config: {},
        skills: [],
        agents,
      },
    }),
  );
}

function makeSettings(projectDir: string, settings: Record<string, unknown>): void {
  const claudeDir = join(projectDir, '.claude');
  mkdirSync(claudeDir, { recursive: true });
  writeFileSync(join(claudeDir, 'settings.local.json'), JSON.stringify(settings, null, 2));
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
    manifest.agents['grimoire.typescript-coder'] = { file_patterns: ['*.ts'] };

    // Act
    writeManifest(projectDir, manifest);

    // Assert
    const loaded = readManifest(projectDir);
    expect(loaded.agents['grimoire.typescript-coder']?.file_patterns).toEqual(['*.ts']);
  });

});

// =============================================================================
// Approaches in the manifest
// =============================================================================

describe('manifest approaches', () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = makeTmpDir('approaches');
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  it('should preserve approaches through readManifest/writeManifest', () => {
    // Arrange
    makeManifest(projectDir, {
      'grimoire.csharp-coder': {
        file_patterns: ['*.cs'],
        approaches: [{ name: 'tdd', directive: 'Tests first.', skill: 'grimoire.unit-testing-dotnet' }],
      },
    });

    // Act — round-trip without touching approaches
    const manifest = readManifest(projectDir);
    writeManifest(projectDir, manifest);

    // Assert
    const raw = readJson(join(projectDir, '.claude', 'grimoire.json')) as {
      router: { agents: Record<string, { file_patterns?: string[]; approaches?: unknown }> };
    };
    expect(raw.router.agents['grimoire.csharp-coder']!.approaches).toEqual([
      { name: 'tdd', directive: 'Tests first.', skill: 'grimoire.unit-testing-dotnet' },
    ]);
    expect(raw.router.agents['grimoire.csharp-coder']!.file_patterns).toEqual(['*.cs']);
  });

  it('should filter agents with approaches via agentsWithApproaches', () => {
    // Arrange
    makeManifest(projectDir, {
      'agent-a': { approaches: [{ name: 'tdd', directive: 'Tests first.' }] },
      'agent-b': { file_patterns: ['*.cs'] },
      'agent-c': {},
    });

    // Act + Assert
    expect(agentsWithApproaches(readManifest(projectDir))).toEqual(['agent-a']);
  });

  it('should filter agents with patterns via agentsWithPatterns', () => {
    // Arrange
    makeManifest(projectDir, {
      'agent-a': { approaches: [{ name: 'tdd', directive: 'Tests first.' }] },
      'agent-b': { file_patterns: ['*.cs'] },
      'agent-c': {},
    });

    // Act + Assert
    expect(agentsWithPatterns(readManifest(projectDir))).toEqual(['agent-b']);
  });

  it('should not count approach entries the router would reject', () => {
    // Arrange — entries the router's parseApproachEntry drops must not keep
    // hooks alive or show as enforced in the CLI
    makeManifest(projectDir, {
      'agent-a': { approaches: [{ name: 'no-directive' }] },
      'agent-b': { approaches: [{ name: 'no-directive' }, { name: 'tdd', directive: 'Tests first.' }] },
      'agent-c': { approaches: [{ name: '   ', directive: 'blank name' }] },
    });

    // Act + Assert
    expect(agentsWithApproaches(readManifest(projectDir))).toEqual(['agent-b']);
  });
});

// =============================================================================
// ensureSubagentHooks
// =============================================================================

describe('ensureSubagentHooks', () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = makeTmpDir('ensure-subagent');
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  it('should create SubagentStart/Stop entries without a PreToolUse hook', () => {
    // Act
    ensureSubagentHooks(projectDir, ['grimoire.csharp-coder']);

    // Assert
    const settings = readJson(join(projectDir, '.claude', 'settings.local.json')) as Record<string, unknown>;
    const hooks = settings['hooks'] as Record<string, Array<{ matcher: string; hooks: Array<{ command: string }> }>>;

    expect(hooks['PreToolUse']).toBeUndefined();
    expect(hooks['SubagentStart']).toHaveLength(1);
    expect(hooks['SubagentStart']![0]!.matcher).toBe('grimoire.csharp-coder');
    expect(hooks['SubagentStart']![0]!.hooks[0]!.command).toContain('--subagent-start');
    expect(hooks['SubagentStop']).toHaveLength(1);
    expect(hooks['SubagentStop']![0]!.hooks[0]!.command).toContain('--subagent-stop');
  });

  it('should be idempotent on re-run', () => {
    // Arrange
    ensureSubagentHooks(projectDir, ['grimoire.csharp-coder']);

    // Act
    ensureSubagentHooks(projectDir, ['grimoire.csharp-coder']);

    // Assert
    const settings = readJson(join(projectDir, '.claude', 'settings.local.json')) as Record<string, unknown>;
    const hooks = settings['hooks'] as Record<string, Array<{ matcher: string }>>;

    expect(hooks['SubagentStart']!.filter((e) => e.matcher === 'grimoire.csharp-coder')).toHaveLength(1);
    expect(hooks['SubagentStop']!.filter((e) => e.matcher === 'grimoire.csharp-coder')).toHaveLength(1);
  });

  it('should migrate legacy --agent= and combined-matcher entries', () => {
    // Arrange
    makeSettings(projectDir, {
      hooks: {
        SubagentStart: [
          {
            matcher: 'grimoire.csharp-coder',
            hooks: [{ type: 'command', command: 'npx @grimoire-cc/router --subagent-start --agent=grimoire.csharp-coder' }],
          },
          {
            matcher: 'grimoire.typescript-coder|grimoire.vue3-coder',
            hooks: [{ type: 'command', command: 'npx @grimoire-cc/router --subagent-start' }],
          },
        ],
      },
    });

    // Act
    ensureSubagentHooks(projectDir, ['grimoire.csharp-coder']);

    // Assert — legacy formats gone, one clean per-agent entry
    const settings = readJson(join(projectDir, '.claude', 'settings.local.json')) as Record<string, unknown>;
    const hooks = settings['hooks'] as Record<string, Array<{ matcher: string; hooks: Array<{ command: string }> }>>;

    expect(hooks['SubagentStart']).toHaveLength(1);
    expect(hooks['SubagentStart']![0]!.matcher).toBe('grimoire.csharp-coder');
    expect(hooks['SubagentStart']![0]!.hooks[0]!.command).not.toContain('--agent=');
  });

  it('should preserve unrelated existing hooks', () => {
    // Arrange
    makeSettings(projectDir, {
      hooks: {
        UserPromptSubmit: [{ matcher: '', hooks: [{ type: 'command', command: 'some-other-tool' }] }],
      },
    });

    // Act
    ensureSubagentHooks(projectDir, ['grimoire.csharp-coder']);

    // Assert
    const settings = readJson(join(projectDir, '.claude', 'settings.local.json')) as Record<string, unknown>;
    const hooks = settings['hooks'] as Record<string, unknown[]>;

    expect(hooks['UserPromptSubmit']).toHaveLength(1);
    expect(hooks['PreToolUse']).toBeUndefined();
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
  it('should return true when current-format subagent-start hook exists (no --agent=)', () => {
    // Arrange — current format: per-agent matcher, no --agent= flag
    const entries = [
      {
        matcher: 'grimoire.typescript-coder',
        hooks: [{ type: 'command', command: 'npx @grimoire-cc/router --subagent-start' }],
      },
    ];

    // Act + Assert
    expect(hasSubagentHook(entries, 'grimoire.typescript-coder', '--subagent-start')).toBe(true);
  });

  it('should return false for legacy injection-format hook with --agent=', () => {
    // Arrange — legacy format with --agent= should not match (triggers migration path)
    const entries = [
      {
        matcher: 'grimoire.typescript-coder',
        hooks: [{ type: 'command', command: 'npx @grimoire-cc/router --subagent-start --agent=grimoire.typescript-coder' }],
      },
    ];

    // Act + Assert
    expect(hasSubagentHook(entries, 'grimoire.typescript-coder', '--subagent-start')).toBe(false);
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

  it('should create settings.local.json with enforce hooks on fresh project', () => {
    // Arrange — fresh projectDir with no settings.local.json

    // Act
    ensureEnforceHooks(projectDir, ['grimoire.typescript-coder']);

    // Assert
    const settings = readJson(join(projectDir, '.claude', 'settings.local.json')) as Record<string, unknown>;
    const hooks = settings['hooks'] as Record<string, unknown[]>;

    expect(hooks['PreToolUse']).toHaveLength(1);
    const preToolEntry = (hooks['PreToolUse'] as Array<{ matcher: string; hooks: Array<{ command: string }> }>)[0];
    expect(preToolEntry!.hooks[0]!.command).toContain('--enforce');

    expect(hooks['SubagentStart']).toHaveLength(1);
    const startEntry = (hooks['SubagentStart'] as Array<{ matcher: string; hooks: Array<{ command: string }> }>)[0];
    expect(startEntry!.matcher).toBe('grimoire.typescript-coder');
    expect(startEntry!.hooks[0]!.command).toContain('--subagent-start');
    expect(startEntry!.hooks[0]!.command).not.toContain('--agent=');

    expect(hooks['SubagentStop']).toHaveLength(1);
    const stopEntry = (hooks['SubagentStop'] as Array<{ matcher: string; hooks: Array<{ command: string }> }>)[0];
    expect(stopEntry!.matcher).toBe('grimoire.typescript-coder');
    expect(stopEntry!.hooks[0]!.command).toContain('--subagent-stop');
    expect(stopEntry!.hooks[0]!.command).not.toContain('--agent=');
  });

  it('should migrate legacy injection-format hooks (--agent=) to current format', () => {
    // Arrange — legacy per-agent entries with --agent= flag
    makeSettings(projectDir, {
      hooks: {
        SubagentStart: [
          {
            matcher: 'grimoire.typescript-coder',
            hooks: [{ type: 'command', command: 'npx @grimoire-cc/router --subagent-start --agent=grimoire.typescript-coder' }],
          },
        ],
        SubagentStop: [
          {
            matcher: 'grimoire.typescript-coder',
            hooks: [{ type: 'command', command: 'npx @grimoire-cc/router --subagent-stop --agent=grimoire.typescript-coder' }],
          },
        ],
      },
    });

    // Act
    ensureEnforceHooks(projectDir, ['grimoire.typescript-coder']);

    // Assert — exactly one entry per event, no --agent= anywhere
    const settings = readJson(join(projectDir, '.claude', 'settings.local.json')) as Record<string, unknown>;
    const hooks = settings['hooks'] as Record<string, Array<{ matcher: string; hooks: Array<{ command: string }> }>>;

    expect(hooks['SubagentStart']).toHaveLength(1);
    expect(hooks['SubagentStart']![0]!.matcher).toBe('grimoire.typescript-coder');
    expect(hooks['SubagentStart']![0]!.hooks[0]!.command).not.toContain('--agent=');

    expect(hooks['SubagentStop']).toHaveLength(1);
    expect(hooks['SubagentStop']![0]!.hooks[0]!.command).not.toContain('--agent=');
  });

  it('should migrate legacy combined-matcher hooks to per-agent entries', () => {
    // Arrange — oldest format: one entry with pipe-combined matcher
    makeSettings(projectDir, {
      hooks: {
        SubagentStart: [
          {
            matcher: 'grimoire.typescript-coder|grimoire.vue3-coder',
            hooks: [{ type: 'command', command: 'npx @grimoire-cc/router --subagent-start' }],
          },
        ],
        SubagentStop: [
          {
            matcher: 'grimoire.typescript-coder|grimoire.vue3-coder',
            hooks: [{ type: 'command', command: 'npx @grimoire-cc/router --subagent-stop' }],
          },
        ],
      },
    });

    // Act
    ensureEnforceHooks(projectDir, ['grimoire.typescript-coder', 'grimoire.vue3-coder']);

    // Assert — combined entry replaced with one entry per agent
    const settings = readJson(join(projectDir, '.claude', 'settings.local.json')) as Record<string, unknown>;
    const hooks = settings['hooks'] as Record<string, Array<{ matcher: string }>>;

    const startMatchers = hooks['SubagentStart']!.map((e) => e.matcher);
    expect(startMatchers).toEqual(['grimoire.typescript-coder', 'grimoire.vue3-coder']);
    const stopMatchers = hooks['SubagentStop']!.map((e) => e.matcher);
    expect(stopMatchers).toEqual(['grimoire.typescript-coder', 'grimoire.vue3-coder']);
  });

  it('should create PreToolUse enforce hook even with empty agent list', () => {
    // Arrange — no agents with file_patterns

    // Act
    ensureEnforceHooks(projectDir, []);

    // Assert
    const settings = readJson(join(projectDir, '.claude', 'settings.local.json')) as Record<string, unknown>;
    const hooks = settings['hooks'] as Record<string, unknown[]>;

    expect(hooks['PreToolUse']).toHaveLength(1);
    const preToolEntry = (hooks['PreToolUse'] as Array<{ matcher: string; hooks: Array<{ command: string }> }>)[0];
    expect(preToolEntry!.hooks[0]!.command).toContain('--enforce');

    expect(hooks['SubagentStart']).toHaveLength(0);
    expect(hooks['SubagentStop']).toHaveLength(0);
  });

  it('should add SubagentStart/Stop entries for multiple agents', () => {
    // Arrange — fresh projectDir

    // Act
    ensureEnforceHooks(projectDir, ['grimoire.typescript-coder', 'grimoire.vue3-coder']);

    // Assert
    const settings = readJson(join(projectDir, '.claude', 'settings.local.json')) as Record<string, unknown>;
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
    const settings = readJson(join(projectDir, '.claude', 'settings.local.json')) as Record<string, unknown>;
    const hooks = settings['hooks'] as Record<string, unknown[]>;

    expect(hooks['PreToolUse']).toHaveLength(1);
  });

  it('should not duplicate SubagentStart entry for same agent on re-run', () => {
    // Arrange
    ensureEnforceHooks(projectDir, ['grimoire.typescript-coder']);

    // Act
    ensureEnforceHooks(projectDir, ['grimoire.typescript-coder']);

    // Assert
    const settings = readJson(join(projectDir, '.claude', 'settings.local.json')) as Record<string, unknown>;
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
    const settings = readJson(join(projectDir, '.claude', 'settings.local.json')) as Record<string, unknown>;
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
    const settings = readJson(join(projectDir, '.claude', 'settings.local.json')) as Record<string, unknown>;
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
    const settings = readJson(join(projectDir, '.claude', 'settings.local.json')) as Record<string, unknown>;
    const hooks = settings['hooks'] as Record<string, Array<{ hooks: Array<{ command: string }> }>>;

    expect(hooks['PreToolUse']).toHaveLength(1);
    expect(hooks['PreToolUse']![0]!.hooks[0]!.command).not.toContain('--enforce');
    expect(hooks['UserPromptSubmit']).toHaveLength(1);
    expect(hooks['SubagentStart']).toBeUndefined();
  });

  it('should be a no-op when settings.local.json does not exist', () => {
    // Arrange — fresh projectDir with no settings.local.json

    // Act + Assert
    expect(() => removeEnforceHooks(projectDir)).not.toThrow();
  });

  it('should spare SubagentStart/Stop entries for agents in the spare list', () => {
    // Arrange — agent-a has approaches (must survive), agent-b is patterns-only
    ensureEnforceHooks(projectDir, ['agent-a', 'agent-b']);

    // Act
    removeEnforceHooks(projectDir, ['agent-a']);

    // Assert — PreToolUse gone, agent-b gone, agent-a Start/Stop intact
    const settings = readJson(join(projectDir, '.claude', 'settings.local.json')) as Record<string, unknown>;
    const hooks = settings['hooks'] as Record<string, Array<{ matcher: string }>>;

    expect(hooks['PreToolUse']).toBeUndefined();
    expect(hooks['SubagentStart']!.map((e) => e.matcher)).toEqual(['agent-a']);
    expect(hooks['SubagentStop']!.map((e) => e.matcher)).toEqual(['agent-a']);
  });

  it('should remove everything when the spare list is empty', () => {
    // Arrange
    ensureEnforceHooks(projectDir, ['agent-a', 'agent-b']);

    // Act
    removeEnforceHooks(projectDir, []);

    // Assert
    const settings = readJson(join(projectDir, '.claude', 'settings.local.json')) as Record<string, unknown>;
    const hooks = (settings['hooks'] ?? {}) as Record<string, unknown>;

    expect(hooks['PreToolUse']).toBeUndefined();
    expect(hooks['SubagentStart']).toBeUndefined();
    expect(hooks['SubagentStop']).toBeUndefined();
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

    const settings = readJson(join(projectDir, '.claude', 'settings.local.json')) as Record<string, unknown>;
    const hooks = settings['hooks'] as Record<string, unknown[]>;
    expect(hooks['UserPromptSubmit']).toHaveLength(1);
  });
});

// =============================================================================
// removeSubagentHooksFor
// =============================================================================

describe('removeSubagentHooksFor', () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = makeTmpDir('remove-subagent');
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  it('should remove SubagentStart/Stop hooks for a specific agent', () => {
    // Arrange
    ensureEnforceHooks(projectDir, ['grimoire.csharp-coder']);

    // Act
    removeSubagentHooksFor(projectDir, 'grimoire.csharp-coder');

    // Assert
    const settings = readJson(join(projectDir, '.claude', 'settings.local.json')) as Record<string, unknown>;
    const hooks = settings['hooks'] as Record<string, unknown[]>;

    expect(hooks['SubagentStart']).toBeUndefined();
    expect(hooks['SubagentStop']).toBeUndefined();
  });

  it('should preserve hooks for other agents', () => {
    // Arrange
    ensureEnforceHooks(projectDir, ['grimoire.csharp-coder', 'grimoire.typescript-coder']);

    // Act
    removeSubagentHooksFor(projectDir, 'grimoire.csharp-coder');

    // Assert
    const settings = readJson(join(projectDir, '.claude', 'settings.local.json')) as Record<string, unknown>;
    const hooks = settings['hooks'] as Record<string, Array<{ matcher: string }>>;

    expect(hooks['SubagentStart']).toHaveLength(1);
    expect(hooks['SubagentStart']![0]!.matcher).toBe('grimoire.typescript-coder');
    expect(hooks['SubagentStop']).toHaveLength(1);
    expect(hooks['SubagentStop']![0]!.matcher).toBe('grimoire.typescript-coder');
  });

  it('should preserve non-enforcement hooks', () => {
    // Arrange
    makeSettings(projectDir, {
      hooks: {
        UserPromptSubmit: [{ matcher: '', hooks: [{ type: 'command', command: 'npx @grimoire-cc/router' }] }],
        PreToolUse: [{ matcher: 'Edit|Write|MultiEdit', hooks: [{ type: 'command', command: 'npx @grimoire-cc/router --enforce' }] }],
        SubagentStart: [{ matcher: 'grimoire.csharp-coder', hooks: [{ type: 'command', command: 'npx @grimoire-cc/router --subagent-start --agent=grimoire.csharp-coder' }] }],
        SubagentStop: [{ matcher: 'grimoire.csharp-coder', hooks: [{ type: 'command', command: 'npx @grimoire-cc/router --subagent-stop --agent=grimoire.csharp-coder' }] }],
      },
    });

    // Act
    removeSubagentHooksFor(projectDir, 'grimoire.csharp-coder');

    // Assert
    const settings = readJson(join(projectDir, '.claude', 'settings.local.json')) as Record<string, unknown>;
    const hooks = settings['hooks'] as Record<string, unknown[]>;

    expect(hooks['UserPromptSubmit']).toHaveLength(1);
    expect(hooks['PreToolUse']).toHaveLength(1);
    expect(hooks['SubagentStart']).toBeUndefined();
    expect(hooks['SubagentStop']).toBeUndefined();
  });

  it('should be a no-op when agent has no hooks', () => {
    // Arrange
    ensureEnforceHooks(projectDir, ['grimoire.typescript-coder']);

    // Act + Assert
    expect(() => removeSubagentHooksFor(projectDir, 'grimoire.csharp-coder')).not.toThrow();

    const settings = readJson(join(projectDir, '.claude', 'settings.local.json')) as Record<string, unknown>;
    const hooks = settings['hooks'] as Record<string, Array<{ matcher: string }>>;

    expect(hooks['SubagentStart']).toHaveLength(1);
    expect(hooks['SubagentStart']![0]!.matcher).toBe('grimoire.typescript-coder');
  });

  it('should be a no-op when settings.local.json does not exist', () => {
    // Arrange — fresh projectDir

    // Act + Assert
    expect(() => removeSubagentHooksFor(projectDir, 'grimoire.csharp-coder')).not.toThrow();
  });
});
