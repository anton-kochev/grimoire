import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Must mock before importing runList so the module picks up the mock
vi.mock('@clack/prompts', () => ({
  intro: vi.fn(),
  outro: vi.fn(),
  note: vi.fn(),
  log: { warn: vi.fn(), error: vi.fn() },
  select: vi.fn(),
  isCancel: vi.fn((v: unknown) => v === Symbol.for('clack.cancel')),
}));

import * as clack from '@clack/prompts';
import { runList } from '../src/commands/list.js';

// ---- Helpers ----------------------------------------------------------------

const CANCEL = Symbol.for('clack.cancel');

const mockSelect = vi.mocked(clack.select);
const mockIntro = vi.mocked(clack.intro);
const mockOutro = vi.mocked(clack.outro);
const mockNote = vi.mocked(clack.note);
const mockWarn = vi.mocked(clack.log.warn);

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
  agents: Record<string, { enforce?: boolean; file_patterns?: string[] }>,
  skills: Array<{
    name: string;
    path: string;
    description?: string;
    triggers?: Record<string, unknown>;
  }> = [],
): void {
  const claudeDir = join(projectDir, '.claude');
  mkdirSync(claudeDir, { recursive: true });
  writeFileSync(
    join(claudeDir, 'skills-manifest.json'),
    JSON.stringify({ version: '1', config: {}, skills, agents }, null, 2),
  );
}

// ---- Test suite -------------------------------------------------------------

describe('runList', () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = makeTmpDir();
    vi.clearAllMocks();
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

  // ---------- Happy paths ------------------------------------------------------

  it('shows select prompt with all installed items', async () => {
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
  });

  it('displays skill detail note when user selects a skill', async () => {
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

    expect(mockNote).toHaveBeenCalledTimes(1);
    const noteContent = vi.mocked(clack.note).mock.calls[0]![0] as string;
    expect(noteContent).toContain('Keywords:');
    expect(noteContent).toContain('Patterns:');
  });

  it('displays agent detail note when user selects an agent', async () => {
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

    expect(mockNote).toHaveBeenCalledTimes(1);
    const noteContent = vi.mocked(clack.note).mock.calls[0]![0] as string;
    expect(noteContent).toContain('Model:');
    expect(noteContent).toContain('Tools:');
    expect(noteContent).toContain('Enforce: no');
  });

  it('shows Enforce: yes with file patterns for an enforced agent', async () => {
    writeAgent(projectDir, 'csharp-coder', 'C# specialist');
    writeManifest(projectDir, {
      'csharp-coder': { enforce: true, file_patterns: ['*.cs'] },
    });
    mockSelect
      .mockResolvedValueOnce({ kind: 'agent', name: 'csharp-coder' } as never)
      .mockResolvedValueOnce(CANCEL as never);

    await runList(projectDir);

    const noteContent = vi.mocked(clack.note).mock.calls[0]![0] as string;
    expect(noteContent).toContain('Enforce: yes');
    expect(noteContent).toContain('*.cs');
  });

  it('loops back to select after showing detail', async () => {
    writeAgent(projectDir, 'agent-a', 'First agent');
    writeSkill(projectDir, 'skill-x', 'A skill');
    writeManifest(projectDir, { 'agent-a': {} }, [
      { name: 'Skill X', path: '.claude/skills/skill-x' },
    ]);
    mockSelect
      .mockResolvedValueOnce({ kind: 'agent', name: 'agent-a' } as never)
      .mockResolvedValueOnce({ kind: 'skill', name: 'skill-x' } as never)
      .mockResolvedValueOnce(CANCEL as never);

    await runList(projectDir);

    expect(mockSelect).toHaveBeenCalledTimes(3);
    expect(mockNote).toHaveBeenCalledTimes(2);
  });

  // ---------- Additional edge cases --------------------------------------------

  it('falls back to manifest description when SKILL.md frontmatter is missing', async () => {
    // Write a skill dir with a SKILL.md that has no frontmatter
    const skillDir = join(projectDir, '.claude', 'skills', 'bare-skill');
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, 'SKILL.md'), '# No frontmatter here\n\nJust body.');

    writeManifest(projectDir, {}, [
      {
        name: 'Bare Skill',
        path: '.claude/skills/bare-skill',
        description: 'Manifest fallback description',
      },
    ]);
    mockSelect
      .mockResolvedValueOnce({ kind: 'skill', name: 'bare-skill' } as never)
      .mockResolvedValueOnce(CANCEL as never);

    // Should not throw; note should still be called
    await runList(projectDir);

    expect(mockNote).toHaveBeenCalledTimes(1);
    const noteContent = vi.mocked(clack.note).mock.calls[0]![0] as string;
    expect(noteContent).toContain('Manifest fallback description');
  });

  it('shows (none) placeholders for skill with empty trigger arrays', async () => {
    writeSkill(projectDir, 'empty-triggers', 'A skill with empty triggers');
    writeManifest(projectDir, {}, [
      {
        name: 'Empty Triggers',
        path: '.claude/skills/empty-triggers',
        triggers: {
          keywords: [],
          file_extensions: [],
          patterns: [],
          file_paths: [],
        },
      },
    ]);
    mockSelect
      .mockResolvedValueOnce({ kind: 'skill', name: 'empty-triggers' } as never)
      .mockResolvedValueOnce(CANCEL as never);

    await runList(projectDir);

    const noteContent = vi.mocked(clack.note).mock.calls[0]![0] as string;
    // All trigger sections should show (none)
    const noneCount = (noteContent.match(/\(none\)/g) ?? []).length;
    expect(noneCount).toBe(4);
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
