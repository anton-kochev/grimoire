import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Must mock before importing runList so the module picks up the mock
vi.mock('@clack/prompts', () => ({
  intro: vi.fn(),
  outro: vi.fn(),
  note: vi.fn(),
  confirm: vi.fn(),
  log: { warn: vi.fn(), error: vi.fn(), message: vi.fn(), info: vi.fn(), success: vi.fn() },
  select: vi.fn(),
  isCancel: vi.fn((v: unknown) => v === Symbol.for('clack.cancel')),
}));

vi.mock('../src/commands/update.js', () => ({
  checkUpdates: vi.fn().mockReturnValue([]),
}));

vi.mock('../src/commands/config.js', () => ({
  runConfig: vi.fn(),
}));

vi.mock('../src/commands/agent-skills.js', () => ({
  runAgentSkillsFor: vi.fn(),
}));

vi.mock('../src/commands/agent-paths.js', () => ({
  runAgentPathsFor: vi.fn(),
}));

vi.mock('../src/enforce.js', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return {
    ...actual,
    ensureEnforceHooks: vi.fn(),
    removeSubagentHooksFor: vi.fn(),
  };
});

vi.mock('../src/grimoire-config.js', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return {
    ...actual,
    readGrimoireConfig: vi.fn().mockReturnValue({}),
  };
});

vi.mock('../src/remove.js', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return {
    ...actual,
    removeSingleItem: vi.fn().mockReturnValue({ removed: true }),
  };
});

vi.mock('../src/copy.js', () => ({
  copyItems: vi.fn().mockReturnValue([]),
}));

import * as clack from '@clack/prompts';
import { runList } from '../src/commands/list.js';
import { checkUpdates } from '../src/commands/update.js';
import { runConfig } from '../src/commands/config.js';
import { runAgentSkillsFor } from '../src/commands/agent-skills.js';
import { runAgentPathsFor } from '../src/commands/agent-paths.js';
import { removeSingleItem } from '../src/remove.js';
import { ensureEnforceHooks, removeSubagentHooksFor } from '../src/enforce.js';
import { readGrimoireConfig } from '../src/grimoire-config.js';

// ---- Helpers ----------------------------------------------------------------

const CANCEL = Symbol.for('clack.cancel');

const mockSelect = vi.mocked(clack.select);
const mockConfirm = vi.mocked(clack.confirm);
const mockNote = vi.mocked(clack.note);
const mockIntro = vi.mocked(clack.intro);
const mockOutro = vi.mocked(clack.outro);
const mockWarn = vi.mocked(clack.log.warn);
const mockLogMessage = vi.mocked(clack.log.message);

function makeTmpDir(): string {
  const raw = join(
    tmpdir(),
    `grimoire-list-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(raw, { recursive: true });
  return realpathSync(raw);
}

function writeAgent(
  projectDir: string,
  name: string,
  description: string,
  extra = '',
): void {
  const agentsDir = join(projectDir, '.claude', 'agents');
  mkdirSync(agentsDir, { recursive: true });
  writeFileSync(
    join(agentsDir, `${name}.md`),
    `---\nname: ${name}\ndescription: ${description}\n${extra}---\n\n# Body`,
  );
}

function writeSkill(projectDir: string, name: string, description: string): void {
  const skillDir = join(projectDir, '.claude', 'skills', name);
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(
    join(skillDir, 'SKILL.md'),
    `---\nname: ${name}\ndescription: ${description}\n---\n\n# Body`,
  );
}

function writeManifest(
  projectDir: string,
  agents: Record<string, { file_patterns?: string[] }>,
  skills: Array<{
    name: string;
    path: string;
    description?: string;
    triggers?: Record<string, unknown>;
  }> = [],
): void {
  const claudeDir = join(projectDir, '.claude');
  mkdirSync(claudeDir, { recursive: true });
  const configPath = join(claudeDir, 'grimoire.json');
  let config: Record<string, unknown> = {};
  if (existsSync(configPath)) {
    try { config = JSON.parse(readFileSync(configPath, 'utf-8')) as Record<string, unknown>; } catch { /* ignore */ }
  }
  config['router'] = { version: '1', config: {}, skills, agents };
  writeFileSync(configPath, JSON.stringify(config, null, 2));
}

// ---- Test suite -------------------------------------------------------------

describe('runList', () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = makeTmpDir();
    vi.clearAllMocks();
    vi.mocked(checkUpdates).mockReturnValue([]);
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  // ---------- Edge cases -------------------------------------------------------

  it('prints warning and returns without prompt when no installed items', async () => {
    await runList(projectDir);

    expect(mockWarn).toHaveBeenCalledWith(
      'No grimoire-managed items found. Run `grimoire add` to get started.',
    );
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it('prints warning and returns when manifest is absent', async () => {
    writeAgent(projectDir, 'some-agent', 'Some description');

    await runList(projectDir);

    expect(mockWarn).toHaveBeenCalledWith(
      expect.stringContaining('No grimoire-managed items found'),
    );
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it('prints outro and returns when user cancels immediately', async () => {
    writeAgent(projectDir, 'my-agent', 'Does things');
    writeManifest(projectDir, { 'my-agent': {} });
    mockSelect.mockResolvedValueOnce(CANCEL as never);

    await runList(projectDir);

    expect(mockOutro).toHaveBeenCalledWith('Done.');
  });

  // ---------- Item list --------------------------------------------------------

  it('shows select prompt with all installed items and settings option', async () => {
    writeAgent(projectDir, 'my-agent', 'Agent desc');
    writeSkill(projectDir, 'my-skill', 'Skill desc');
    writeManifest(projectDir, { 'my-agent': {} }, [
      { name: 'My Skill', path: '.claude/skills/my-skill' },
    ]);
    mockSelect.mockResolvedValueOnce(CANCEL as never);

    await runList(projectDir);

    expect(mockSelect).toHaveBeenCalledTimes(1);
    const callArgs = mockSelect.mock.calls[0]![0] as {
      options: Array<{ label: string }>;
    };
    const labels = callArgs.options.map((o) => o.label);
    expect(labels).toContain('[agent] my-agent');
    expect(labels).toContain('[skill] my-skill');
    expect(labels.some((l) => l.includes('Settings'))).toBe(true);
  });

  // ---------- Action menu — detail display ------------------------------------

  it('shows item detail via note before action menu', async () => {
    writeAgent(
      projectDir,
      'my-agent',
      'Does things with code',
      'model: claude-opus-4-5\ntools: Edit,Write\n',
    );
    writeManifest(projectDir, { 'my-agent': {} });
    mockSelect
      .mockResolvedValueOnce({ kind: 'agent', name: 'my-agent' } as never)
      .mockResolvedValueOnce(CANCEL as never);

    await runList(projectDir);

    expect(mockNote).toHaveBeenCalled();
    const noteContent = mockNote.mock.calls[0]![0] as string;
    expect(noteContent).toContain('Does things with code');
    expect(noteContent).toContain('claude-opus-4-5');
    expect(noteContent).not.toContain('Tools:');
  });

  it('shows current skills in agent detail note', async () => {
    writeAgent(
      projectDir,
      'my-agent',
      'Agent with skills',
      'model: sonnet\nskills:\n  - skill-alpha\n  - skill-beta\n',
    );
    writeManifest(projectDir, { 'my-agent': {} });
    mockSelect
      .mockResolvedValueOnce({ kind: 'agent', name: 'my-agent' } as never)
      .mockResolvedValueOnce(CANCEL as never);

    await runList(projectDir);

    expect(mockNote).toHaveBeenCalled();
    const noteContent = mockNote.mock.calls[0]![0] as string;
    expect(noteContent).toContain('Skills:');
    expect(noteContent).toContain('skill-alpha');
    expect(noteContent).toContain('skill-beta');
  });

  it('shows enforcement paths in agent detail when file_patterns exist', async () => {
    writeAgent(projectDir, 'my-agent', 'Typed agent', 'model: sonnet\n');
    writeManifest(projectDir, { 'my-agent': { file_patterns: ['*.ts', '*.tsx'] } });
    mockSelect
      .mockResolvedValueOnce({ kind: 'agent', name: 'my-agent' } as never)
      .mockResolvedValueOnce(CANCEL as never);

    await runList(projectDir);

    expect(mockNote).toHaveBeenCalled();
    const noteContent = mockNote.mock.calls[0]![0] as string;
    expect(noteContent).toContain('Enforcement paths: *.ts, *.tsx');
  });

  it('shows (none) for enforcement paths when agent has no file_patterns', async () => {
    writeAgent(projectDir, 'my-agent', 'Plain agent', 'model: sonnet\n');
    writeManifest(projectDir, { 'my-agent': {} });
    mockSelect
      .mockResolvedValueOnce({ kind: 'agent', name: 'my-agent' } as never)
      .mockResolvedValueOnce(CANCEL as never);

    await runList(projectDir);

    expect(mockNote).toHaveBeenCalled();
    const noteContent = mockNote.mock.calls[0]![0] as string;
    expect(noteContent).toContain('Enforcement paths: (none)');
  });

  it('shows skill detail via note with triggers', async () => {
    writeSkill(projectDir, 'my-skill', 'TDD specialist');
    writeManifest(projectDir, {}, [
      {
        name: 'My Skill',
        path: '.claude/skills/my-skill',
        triggers: {
          keywords: ['tdd', 'test'],
          file_extensions: ['.ts'],
          patterns: ['**/*.test.ts'],
          file_paths: ['vitest.config.ts'],
        },
      },
    ]);
    mockSelect
      .mockResolvedValueOnce({ kind: 'skill', name: 'my-skill' } as never)
      .mockResolvedValueOnce(CANCEL as never);

    await runList(projectDir);

    expect(mockNote).toHaveBeenCalled();
    const noteContent = mockNote.mock.calls[0]![0] as string;
    expect(noteContent).toContain('TDD specialist');
    expect(noteContent).toContain('tdd');
  });

  // ---------- Action menu — remove --------------------------------------------

  it('removes item when remove action confirmed and exits', async () => {
    writeAgent(projectDir, 'my-agent', 'Agent desc');
    writeManifest(projectDir, { 'my-agent': {} });
    mockSelect
      .mockResolvedValueOnce({ kind: 'agent', name: 'my-agent' } as never)
      .mockResolvedValueOnce('remove' as never);
    mockConfirm.mockResolvedValueOnce(true as never);

    await runList(projectDir);

    expect(vi.mocked(removeSingleItem)).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'agent', name: 'my-agent' }),
      projectDir,
    );
    // Should exit after remove — no more select calls
    expect(mockSelect).toHaveBeenCalledTimes(2);
  });

  it('does not remove item when remove action declined and exits', async () => {
    writeAgent(projectDir, 'my-agent', 'Agent desc');
    writeManifest(projectDir, { 'my-agent': {} });
    mockSelect
      .mockResolvedValueOnce({ kind: 'agent', name: 'my-agent' } as never)
      .mockResolvedValueOnce('remove' as never)
      // Safety: current impl loops back; new impl should exit after 2 calls
      .mockResolvedValue(CANCEL as never);
    mockConfirm.mockResolvedValueOnce(false as never);

    await runList(projectDir);

    expect(vi.mocked(removeSingleItem)).not.toHaveBeenCalled();
    // After implementation: should exit after decline — only 2 select calls
    expect(mockSelect).toHaveBeenCalledTimes(2);
  });

  // ---------- Action menu — update --------------------------------------------

  it('shows update action only when update available', async () => {
    writeAgent(projectDir, 'my-agent', 'Agent desc');
    writeManifest(projectDir, { 'my-agent': {} });
    vi.mocked(checkUpdates).mockReturnValue([
      {
        item: { type: 'agent', name: 'my-agent', sourcePath: '', description: '' },
        installedVersion: '1.0.0',
        availableVersion: '2.0.0',
        hasUpdate: true,
        packDir: '/fake/pack',
        sourcePath: 'agents/my-agent.md',
      },
    ]);
    mockSelect
      .mockResolvedValueOnce({ kind: 'agent', name: 'my-agent' } as never)
      .mockResolvedValueOnce(CANCEL as never);

    await runList(projectDir);

    // Second select call is the action menu
    const actionArgs = mockSelect.mock.calls[1]![0] as {
      options: Array<{ value: string; label: string }>;
    };
    const actionLabels = actionArgs.options.map((o) => o.label);
    expect(actionLabels.some((l) => l.includes('Update'))).toBe(true);
  });

  it('does not show update action when item is up to date', async () => {
    writeAgent(projectDir, 'my-agent', 'Agent desc');
    writeManifest(projectDir, { 'my-agent': {} });
    // checkUpdates returns no updates (default mock returns [])
    mockSelect
      .mockResolvedValueOnce({ kind: 'agent', name: 'my-agent' } as never)
      .mockResolvedValueOnce(CANCEL as never);

    await runList(projectDir);

    const actionArgs = mockSelect.mock.calls[1]![0] as {
      options: Array<{ value: string; label: string }>;
    };
    const actionLabels = actionArgs.options.map((o) => o.label);
    expect(actionLabels.some((l) => l.includes('Update'))).toBe(false);
  });

  // ---------- Action menu — manage skills (agents only) -----------------------

  it('shows manage-skills action for agents', async () => {
    writeAgent(projectDir, 'my-agent', 'Agent desc');
    writeManifest(projectDir, { 'my-agent': {} });
    mockSelect
      .mockResolvedValueOnce({ kind: 'agent', name: 'my-agent' } as never)
      .mockResolvedValueOnce(CANCEL as never);

    await runList(projectDir);

    const agentActions = mockSelect.mock.calls[1]![0] as {
      options: Array<{ value: string }>;
    };
    expect(agentActions.options.some((o) => o.value === 'manage-skills')).toBe(true);
  });

  it('does not show manage-skills action for skills', async () => {
    writeSkill(projectDir, 'my-skill', 'Skill desc');
    writeManifest(projectDir, {}, [
      { name: 'My Skill', path: '.claude/skills/my-skill' },
    ]);
    mockSelect
      .mockResolvedValueOnce({ kind: 'skill', name: 'my-skill' } as never)
      .mockResolvedValueOnce(CANCEL as never);

    await runList(projectDir);

    const skillActions = mockSelect.mock.calls[1]![0] as {
      options: Array<{ value: string }>;
    };
    expect(skillActions.options.some((o) => o.value === 'manage-skills')).toBe(false);
  });

  it('calls runAgentSkillsFor and exits when manage-skills selected', async () => {
    writeAgent(projectDir, 'my-agent', 'Agent desc');
    writeManifest(projectDir, { 'my-agent': {} });
    mockSelect
      .mockResolvedValueOnce({ kind: 'agent', name: 'my-agent' } as never)
      .mockResolvedValueOnce('manage-skills' as never)
      // Safety: current impl loops; new impl should exit after 2 calls
      .mockResolvedValue(CANCEL as never);

    await runList(projectDir);

    expect(vi.mocked(runAgentSkillsFor)).toHaveBeenCalledWith(projectDir, 'my-agent');
    // After implementation: should exit after manage-skills — only 2 select calls
    expect(mockSelect).toHaveBeenCalledTimes(2);
  });

  // ---------- Action menu — manage paths (agents only) -----------------------

  it('shows manage-paths action for agents', async () => {
    writeAgent(projectDir, 'my-agent', 'Agent desc');
    writeManifest(projectDir, { 'my-agent': {} });
    mockSelect
      .mockResolvedValueOnce({ kind: 'agent', name: 'my-agent' } as never)
      .mockResolvedValueOnce(CANCEL as never);

    await runList(projectDir);

    const agentActions = mockSelect.mock.calls[1]![0] as {
      options: Array<{ value: string }>;
    };
    expect(agentActions.options.some((o) => o.value === 'manage-paths')).toBe(true);
  });

  it('does not show manage-paths action for skills', async () => {
    writeSkill(projectDir, 'my-skill', 'Skill desc');
    writeManifest(projectDir, {}, [
      { name: 'My Skill', path: '.claude/skills/my-skill' },
    ]);
    mockSelect
      .mockResolvedValueOnce({ kind: 'skill', name: 'my-skill' } as never)
      .mockResolvedValueOnce(CANCEL as never);

    await runList(projectDir);

    const skillActions = mockSelect.mock.calls[1]![0] as {
      options: Array<{ value: string }>;
    };
    expect(skillActions.options.some((o) => o.value === 'manage-paths')).toBe(false);
  });

  it('calls runAgentPathsFor when manage-paths selected', async () => {
    writeAgent(projectDir, 'my-agent', 'Agent desc');
    writeManifest(projectDir, { 'my-agent': {} });
    mockSelect
      .mockResolvedValueOnce({ kind: 'agent', name: 'my-agent' } as never)
      .mockResolvedValueOnce('manage-paths' as never);

    await runList(projectDir);

    expect(vi.mocked(runAgentPathsFor)).toHaveBeenCalledWith(projectDir, 'my-agent');
    expect(mockSelect).toHaveBeenCalledTimes(2);
  });

  it('re-applies enforcement hooks after manage-paths when enforcement enabled', async () => {
    writeAgent(projectDir, 'my-agent', 'Agent desc');
    writeManifest(projectDir, { 'my-agent': { file_patterns: ['*.ts'] } });
    vi.mocked(readGrimoireConfig).mockReturnValue({ enforcement: true });
    mockSelect
      .mockResolvedValueOnce({ kind: 'agent', name: 'my-agent' } as never)
      .mockResolvedValueOnce('manage-paths' as never);

    await runList(projectDir);

    expect(vi.mocked(ensureEnforceHooks)).toHaveBeenCalledWith(
      projectDir,
      expect.arrayContaining(['my-agent']),
    );
  });

  it('does not re-apply hooks after manage-paths when enforcement disabled', async () => {
    writeAgent(projectDir, 'my-agent', 'Agent desc');
    writeManifest(projectDir, { 'my-agent': { file_patterns: ['*.ts'] } });
    vi.mocked(readGrimoireConfig).mockReturnValue({});
    mockSelect
      .mockResolvedValueOnce({ kind: 'agent', name: 'my-agent' } as never)
      .mockResolvedValueOnce('manage-paths' as never);

    await runList(projectDir);

    expect(vi.mocked(ensureEnforceHooks)).not.toHaveBeenCalled();
  });

  it('removes stale subagent hooks after manage-paths when agent has no patterns', async () => {
    writeAgent(projectDir, 'my-agent', 'Agent desc');
    writeManifest(projectDir, { 'my-agent': {} });
    vi.mocked(readGrimoireConfig).mockReturnValue({ enforcement: true });
    mockSelect
      .mockResolvedValueOnce({ kind: 'agent', name: 'my-agent' } as never)
      .mockResolvedValueOnce('manage-paths' as never);

    await runList(projectDir);

    expect(vi.mocked(removeSubagentHooksFor)).toHaveBeenCalledWith(projectDir, 'my-agent');
  });

  it('does not remove subagent hooks when agent still has patterns after manage-paths', async () => {
    writeAgent(projectDir, 'my-agent', 'Agent desc');
    writeManifest(projectDir, { 'my-agent': { file_patterns: ['*.ts'] } });
    vi.mocked(readGrimoireConfig).mockReturnValue({ enforcement: true });
    mockSelect
      .mockResolvedValueOnce({ kind: 'agent', name: 'my-agent' } as never)
      .mockResolvedValueOnce('manage-paths' as never);

    await runList(projectDir);

    expect(vi.mocked(removeSubagentHooksFor)).not.toHaveBeenCalled();
  });

  // ---------- Settings option --------------------------------------------------

  it('calls runConfig when settings selected', async () => {
    writeAgent(projectDir, 'my-agent', 'Desc');
    writeManifest(projectDir, { 'my-agent': {} });
    mockSelect
      .mockResolvedValueOnce({ kind: 'settings' } as never)
      .mockResolvedValueOnce(CANCEL as never);

    await runList(projectDir);

    expect(vi.mocked(runConfig)).toHaveBeenCalledWith(projectDir, { quiet: true });
  });

  // ---------- Loop behavior ---------------------------------------------------

  it('exits after action menu cancel instead of looping back', async () => {
    writeAgent(projectDir, 'agent-a', 'First agent');
    writeManifest(projectDir, { 'agent-a': {} });
    mockSelect
      .mockResolvedValueOnce({ kind: 'agent', name: 'agent-a' } as never)
      .mockResolvedValueOnce(CANCEL as never);

    await runList(projectDir);

    // 2 select calls: item select + action cancel — no loop back
    expect(mockSelect).toHaveBeenCalledTimes(2);
  });

  // ---------- Description formatting ------------------------------------------

  it('renders literal \\n escape sequences as newlines in agent description', async () => {
    writeAgent(projectDir, 'my-agent', 'First line\\nSecond line\\nThird line');
    writeManifest(projectDir, { 'my-agent': {} });
    mockSelect
      .mockResolvedValueOnce({ kind: 'agent', name: 'my-agent' } as never)
      .mockResolvedValueOnce(CANCEL as never);

    await runList(projectDir);

    expect(mockNote).toHaveBeenCalled();
    const noteContent = mockNote.mock.calls[0]![0] as string;
    expect(noteContent).toContain('First line');
    expect(noteContent).toContain('Second line');
    expect(noteContent).not.toContain('\\n');
  });

  it('strips <example> blocks from agent description', async () => {
    writeAgent(
      projectDir,
      'my-agent',
      'Short intro. <example>Context: blah\\nuser: foo\\nassistant: bar</example> End.',
    );
    writeManifest(projectDir, { 'my-agent': {} });
    mockSelect
      .mockResolvedValueOnce({ kind: 'agent', name: 'my-agent' } as never)
      .mockResolvedValueOnce(CANCEL as never);

    await runList(projectDir);

    expect(mockNote).toHaveBeenCalled();
    const noteContent = mockNote.mock.calls[0]![0] as string;
    expect(noteContent).not.toContain('<example>');
    expect(noteContent).not.toContain('</example>');
    expect(noteContent).toContain('Short intro');
  });

  it('handles double-escaped \\\\n sequences without leaving trailing backslashes', async () => {
    writeAgent(projectDir, 'my-agent', 'First line\\\\nSecond line\\\\nThird line');
    writeManifest(projectDir, { 'my-agent': {} });
    mockSelect
      .mockResolvedValueOnce({ kind: 'agent', name: 'my-agent' } as never)
      .mockResolvedValueOnce(CANCEL as never);

    await runList(projectDir);

    expect(mockNote).toHaveBeenCalled();
    const noteContent = mockNote.mock.calls[0]![0] as string;
    expect(noteContent).toContain('First line');
    expect(noteContent).toContain('Second line');
    expect(noteContent).not.toContain('\\');
  });

  it('strips trailing "Examples:" left after example block removal', async () => {
    writeAgent(
      projectDir,
      'my-agent',
      'Great agent.\\nExamples:\\n<example>stuff</example>',
    );
    writeManifest(projectDir, { 'my-agent': {} });
    mockSelect
      .mockResolvedValueOnce({ kind: 'agent', name: 'my-agent' } as never)
      .mockResolvedValueOnce(CANCEL as never);

    await runList(projectDir);

    expect(mockNote).toHaveBeenCalled();
    const noteContent = mockNote.mock.calls[0]![0] as string;
    expect(noteContent).toContain('Great agent');
    expect(noteContent).not.toMatch(/Examples?\s*:/i);
  });

  it('strips trailing "Examples of when to use this agent" after example removal', async () => {
    writeAgent(
      projectDir,
      'my-agent',
      'Great agent for code. Examples of when to use this agent: <example>stuff</example>',
    );
    writeManifest(projectDir, { 'my-agent': {} });
    mockSelect
      .mockResolvedValueOnce({ kind: 'agent', name: 'my-agent' } as never)
      .mockResolvedValueOnce(CANCEL as never);

    await runList(projectDir);

    expect(mockNote).toHaveBeenCalled();
    const noteContent = mockNote.mock.calls[0]![0] as string;
    expect(noteContent).not.toContain('Examples of when to use this agent');
    expect(noteContent).toContain('Great agent for code');
  });

  // ---------- Intro is shown when items exist ----------------------------------

  it('shows intro when items are present', async () => {
    writeAgent(projectDir, 'my-agent', 'Desc');
    writeManifest(projectDir, { 'my-agent': {} });
    mockSelect.mockResolvedValueOnce(CANCEL as never);

    await runList(projectDir);

    expect(mockIntro).toHaveBeenCalledWith('Grimoire — Installed Items');
  });
});
