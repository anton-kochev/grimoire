import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, realpathSync, rmSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

vi.mock('@clack/prompts', () => ({
  intro: vi.fn(),
  outro: vi.fn(),
  cancel: vi.fn(),
  log: { warn: vi.fn(), error: vi.fn(), message: vi.fn(), info: vi.fn(), success: vi.fn() },
  select: vi.fn(),
  multiselect: vi.fn(),
  isCancel: vi.fn((v: unknown) => v === Symbol.for('clack.cancel')),
}));

import * as clack from '@clack/prompts';
import { runAgentSkillsFor } from '../src/commands/agent-skills.js';

const CANCEL = Symbol.for('clack.cancel');
const mockSelect = vi.mocked(clack.select);

function makeTmpDir(): string {
  const raw = join(tmpdir(), `grimoire-agent-skills-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(raw, { recursive: true });
  return realpathSync(raw);
}

function writeAgent(projectDir: string, name: string, skills: string[] = []): void {
  const agentsDir = join(projectDir, '.claude', 'agents');
  mkdirSync(agentsDir, { recursive: true });
  const skillsBlock = skills.length > 0
    ? `skills:\n${skills.map((s) => `  - ${s}`).join('\n')}\n`
    : '';
  writeFileSync(
    join(agentsDir, `${name}.md`),
    `---\nname: ${name}\ndescription: Test agent\n${skillsBlock}---\n\n# Body`,
  );
}

function writeSkill(projectDir: string, name: string): void {
  const skillDir = join(projectDir, '.claude', 'skills', name);
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(join(skillDir, 'SKILL.md'), `---\nname: ${name}\ndescription: A skill\n---\n\n# Body`);
}

describe('runAgentSkillsFor', () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = makeTmpDir();
    vi.clearAllMocks();
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  it('should show current skills and exit on done', async () => {
    writeAgent(projectDir, 'my-agent', ['skill-a']);
    mockSelect.mockResolvedValueOnce('done' as never);

    await runAgentSkillsFor(projectDir, 'my-agent');

    expect(vi.mocked(clack.log.info)).toHaveBeenCalledWith(
      expect.stringContaining('skill-a'),
    );
  });

  it('should exit on cancel', async () => {
    writeAgent(projectDir, 'my-agent');
    mockSelect.mockResolvedValueOnce(CANCEL as never);

    await runAgentSkillsFor(projectDir, 'my-agent');

    // Should not throw, just return
  });

  it('should not call intro or outro', async () => {
    writeAgent(projectDir, 'my-agent');
    mockSelect.mockResolvedValueOnce('done' as never);

    await runAgentSkillsFor(projectDir, 'my-agent');

    expect(vi.mocked(clack.intro)).not.toHaveBeenCalled();
    expect(vi.mocked(clack.outro)).not.toHaveBeenCalled();
  });

  it('should add skills and exit without looping', async () => {
    writeAgent(projectDir, 'my-agent');
    writeSkill(projectDir, 'new-skill');

    mockSelect.mockResolvedValueOnce('add' as never);
    vi.mocked(clack.multiselect).mockResolvedValueOnce(['new-skill'] as never);

    await runAgentSkillsFor(projectDir, 'my-agent');

    const content = readFileSync(join(projectDir, '.claude', 'agents', 'my-agent.md'), 'utf-8');
    expect(content).toContain('new-skill');
    // select should only be called once (the add action), not loop back
    expect(mockSelect).toHaveBeenCalledTimes(1);
  });
});
