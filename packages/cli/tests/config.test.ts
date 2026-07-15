import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

vi.mock('@clack/prompts', () => ({
  intro: vi.fn(),
  outro: vi.fn(),
  cancel: vi.fn(),
  log: { warn: vi.fn(), error: vi.fn(), message: vi.fn(), info: vi.fn(), success: vi.fn() },
  select: vi.fn(),
  multiselect: vi.fn(),
  text: vi.fn(),
  isCancel: vi.fn((v: unknown) => v === Symbol.for('clack.cancel')),
}));

import * as clack from '@clack/prompts';
import { runConfig } from '../src/commands/config.js';
import { ensureEnforceHooks } from '../src/enforce.js';

const CANCEL = Symbol.for('clack.cancel');

function makeTmpDir(): string {
  const raw = join(tmpdir(), `grimoire-config-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(raw, { recursive: true });
  return realpathSync(raw);
}

function writeManifest(
  projectDir: string,
  agents: Record<string, unknown> = {},
): void {
  const claudeDir = join(projectDir, '.claude');
  mkdirSync(claudeDir, { recursive: true });
  const configPath = join(claudeDir, 'grimoire.json');
  let config: Record<string, unknown> = {};
  if (existsSync(configPath)) {
    try { config = JSON.parse(readFileSync(configPath, 'utf-8')) as Record<string, unknown>; } catch { /* ignore */ }
  }
  config['router'] = { version: '1', config: {}, skills: [], agents };
  writeFileSync(configPath, JSON.stringify(config));
}

describe('runConfig', () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = makeTmpDir();
    writeManifest(projectDir);
    vi.clearAllMocks();
    // Default retention answer so archive-enabled paths don't hang on the prompt.
    vi.mocked(clack.text).mockResolvedValue('20' as never);
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  it('should show intro and outro in normal mode', async () => {
    vi.mocked(clack.multiselect).mockResolvedValueOnce(CANCEL as never);

    await runConfig(projectDir);

    expect(vi.mocked(clack.intro)).toHaveBeenCalledWith('Grimoire configuration');
    expect(vi.mocked(clack.outro)).toHaveBeenCalled();
  });

  it('should skip intro and outro in quiet mode', async () => {
    vi.mocked(clack.multiselect).mockResolvedValueOnce(CANCEL as never);

    await runConfig(projectDir, { quiet: true });

    expect(vi.mocked(clack.intro)).not.toHaveBeenCalled();
    expect(vi.mocked(clack.outro)).not.toHaveBeenCalled();
  });

  function readConfig(): Record<string, unknown> {
    return JSON.parse(readFileSync(join(projectDir, '.claude', 'grimoire.json'), 'utf-8')) as Record<string, unknown>;
  }

  it('should enable verbose enforcement logging when its toggle is selected', async () => {
    // 'archive' is default-on; keep it selected so this test only exercises verboseLog
    vi.mocked(clack.multiselect).mockResolvedValueOnce(['verboseLog', 'archive'] as never);

    await runConfig(projectDir, { quiet: true });

    expect(readConfig()['verboseEnforcementLog']).toBe(true);
  });

  it('should clear verbose enforcement logging when its toggle is deselected', async () => {
    // Arrange — start with the flag on
    const configPath = join(projectDir, '.claude', 'grimoire.json');
    const config = JSON.parse(readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
    config['verboseEnforcementLog'] = true;
    writeFileSync(configPath, JSON.stringify(config));
    // keep 'archive' selected — only verboseLog is being cleared here
    vi.mocked(clack.multiselect).mockResolvedValueOnce(['archive'] as never);

    // Act
    await runConfig(projectDir, { quiet: true });

    // Assert
    expect(readConfig()['verboseEnforcementLog']).toBe(false);
  });

  function insights(): Record<string, unknown> {
    return (readConfig()['insights'] ?? {}) as Record<string, unknown>;
  }

  it('should record archiving on with the chosen retention when selected', async () => {
    vi.mocked(clack.multiselect).mockResolvedValueOnce(['archive'] as never);
    vi.mocked(clack.text).mockResolvedValueOnce('10' as never);

    await runConfig(projectDir, { quiet: true });

    expect(insights()['archive']).toBe(true);
    expect(insights()['retainRunsPerAgent']).toBe(10);
  });

  it('should disable archiving when the default-on toggle is deselected', async () => {
    vi.mocked(clack.multiselect).mockResolvedValueOnce([] as never);

    await runConfig(projectDir, { quiet: true });

    expect(insights()['archive']).toBe(false);
  });

  it('should not prompt for retention when archiving is disabled', async () => {
    vi.mocked(clack.multiselect).mockResolvedValueOnce([] as never);

    await runConfig(projectDir, { quiet: true });

    expect(vi.mocked(clack.text)).not.toHaveBeenCalled();
  });

  it('should leave an existing retainRunsPerAgent untouched when disabling', async () => {
    // Arrange — archiving on with a custom retention
    const configPath = join(projectDir, '.claude', 'grimoire.json');
    const config = JSON.parse(readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
    config['insights'] = { archive: true, retainRunsPerAgent: 5 };
    writeFileSync(configPath, JSON.stringify(config));
    vi.mocked(clack.multiselect).mockResolvedValueOnce([] as never);

    // Act
    await runConfig(projectDir, { quiet: true });

    // Assert — disabled, but the retention count survives for later re-enable
    expect(insights()['archive']).toBe(false);
    expect(insights()['retainRunsPerAgent']).toBe(5);
  });

  it('should re-enable archiving from a disabled state', async () => {
    const configPath = join(projectDir, '.claude', 'grimoire.json');
    const config = JSON.parse(readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
    config['insights'] = { archive: false };
    writeFileSync(configPath, JSON.stringify(config));
    vi.mocked(clack.multiselect).mockResolvedValueOnce(['archive'] as never);

    await runConfig(projectDir, { quiet: true });

    expect(insights()['archive']).toBe(true);
  });

  function readHooks(): Record<string, Array<{ matcher: string }>> {
    const settings = JSON.parse(
      readFileSync(join(projectDir, '.claude', 'settings.local.json'), 'utf-8'),
    ) as Record<string, unknown>;
    return (settings['hooks'] ?? {}) as Record<string, Array<{ matcher: string }>>;
  }

  function setEnforcement(value: boolean): void {
    const configPath = join(projectDir, '.claude', 'grimoire.json');
    const config = JSON.parse(readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
    config['enforcement'] = value;
    writeFileSync(configPath, JSON.stringify(config));
  }

  it('should keep subagent hooks for agents with approaches when disabling enforcement', async () => {
    // Arrange — agent-a is approach-driven, agent-b is patterns-only
    writeManifest(projectDir, {
      'agent-a': { approaches: [{ name: 'tdd', directive: 'Tests first.' }] },
      'agent-b': { file_patterns: ['*.cs'] },
    });
    setEnforcement(true);
    ensureEnforceHooks(projectDir, ['agent-a', 'agent-b']);
    vi.mocked(clack.multiselect).mockResolvedValueOnce(['archive'] as never);

    // Act — enforcement deselected
    await runConfig(projectDir, { quiet: true });

    // Assert
    const hooks = readHooks();
    expect(hooks['PreToolUse']).toBeUndefined();
    expect((hooks['SubagentStart'] ?? []).map((e) => e.matcher)).toEqual(['agent-a']);
    expect((hooks['SubagentStop'] ?? []).map((e) => e.matcher)).toEqual(['agent-a']);
  });

  it('should remove all enforce hooks on disable when no agent has approaches', async () => {
    // Arrange
    writeManifest(projectDir, { 'agent-b': { file_patterns: ['*.cs'] } });
    setEnforcement(true);
    ensureEnforceHooks(projectDir, ['agent-b']);
    vi.mocked(clack.multiselect).mockResolvedValueOnce(['archive'] as never);

    // Act
    await runConfig(projectDir, { quiet: true });

    // Assert
    const hooks = readHooks();
    expect(hooks['PreToolUse']).toBeUndefined();
    expect(hooks['SubagentStart']).toBeUndefined();
    expect(hooks['SubagentStop']).toBeUndefined();
  });

  it('should ensure subagent hooks for approach-only agents when enabling enforcement', async () => {
    // Arrange — agent-a has approaches but no file patterns
    writeManifest(projectDir, {
      'agent-a': { approaches: [{ name: 'tdd', directive: 'Tests first.' }] },
    });
    vi.mocked(clack.multiselect).mockResolvedValueOnce(['enforcement', 'archive'] as never);

    // Act
    await runConfig(projectDir, { quiet: true });

    // Assert
    const hooks = readHooks();
    expect(hooks['PreToolUse']).toHaveLength(1);
    expect((hooks['SubagentStart'] ?? []).map((e) => e.matcher)).toContain('agent-a');
    expect((hooks['SubagentStop'] ?? []).map((e) => e.matcher)).toContain('agent-a');
  });
});
