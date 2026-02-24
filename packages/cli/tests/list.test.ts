import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { runList } from '../src/commands/list.js';

function makeTmpDir(): string {
  const raw = join(
    tmpdir(),
    `grimoire-list-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(raw, { recursive: true });
  return realpathSync(raw);
}

function writeAgent(projectDir: string, name: string, description: string): void {
  const agentsDir = join(projectDir, '.claude', 'agents');
  mkdirSync(agentsDir, { recursive: true });
  writeFileSync(
    join(agentsDir, `${name}.md`),
    `---\nname: ${name}\ndescription: ${description}\n---\n\n# Body`,
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
  agents: Record<string, { enforce?: boolean }>,
  skills: Array<{ name: string; path: string }> = [],
): void {
  const claudeDir = join(projectDir, '.claude');
  mkdirSync(claudeDir, { recursive: true });
  writeFileSync(
    join(claudeDir, 'skills-manifest.json'),
    JSON.stringify(
      {
        version: '1',
        config: {},
        skills,
        agents,
      },
      null,
      2,
    ),
  );
}

describe('runList', () => {
  let projectDir: string;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    projectDir = makeTmpDir();
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    rmSync(projectDir, { recursive: true, force: true });
  });

  it('prints nothing-installed message for an empty project', () => {
    runList(projectDir);

    expect(logSpy).toHaveBeenCalledWith(
      'No agents or skills installed. Run `grimoire add` to get started.',
    );
    expect(logSpy).toHaveBeenCalledTimes(1);
  });

  it('prints nothing-installed message when manifest is absent', () => {
    writeAgent(projectDir, 'some-agent', 'Some description');

    runList(projectDir);

    const calls = logSpy.mock.calls.map((c) => c[0] as string);
    expect(calls.some((l) => l.includes('No agents or skills installed'))).toBe(true);
    expect(calls.some((l) => l.includes('some-agent'))).toBe(false);
  });

  it('prints agents section when only agents are present', () => {
    writeAgent(projectDir, 'my-agent', 'Does things with code');
    writeManifest(projectDir, { 'my-agent': {} });

    runList(projectDir);

    const calls = logSpy.mock.calls.map((c) => c[0] as string);
    expect(calls.some((l) => l.startsWith('Agents (1)'))).toBe(true);
    expect(calls.some((l) => l.includes('my-agent'))).toBe(true);
    expect(calls.some((l) => l.includes('Does things with code'))).toBe(true);
    expect(calls.some((l) => l.startsWith('Skills'))).toBe(false);
  });

  it('prints skills section when only skills are present', () => {
    writeSkill(projectDir, 'my-skill', 'TDD specialist');
    writeManifest(projectDir, {}, [{ name: 'My Skill', path: '.claude/skills/my-skill' }]);

    runList(projectDir);

    const calls = logSpy.mock.calls.map((c) => c[0] as string);
    expect(calls.some((l) => l.startsWith('Skills (1)'))).toBe(true);
    expect(calls.some((l) => l.includes('my-skill'))).toBe(true);
    expect(calls.some((l) => l.includes('TDD specialist'))).toBe(true);
    expect(calls.some((l) => l.startsWith('Agents'))).toBe(false);
  });

  it('prints both sections and correct summary when agents and skills are present', () => {
    writeAgent(projectDir, 'agent-a', 'An agent');
    writeAgent(projectDir, 'agent-b', 'Another agent');
    writeSkill(projectDir, 'skill-x', 'A skill');
    writeManifest(projectDir, { 'agent-a': {}, 'agent-b': {} }, [
      { name: 'Skill X', path: '.claude/skills/skill-x' },
    ]);

    runList(projectDir);

    const calls = logSpy.mock.calls.map((c) => c[0] as string);
    expect(calls.some((l) => l.startsWith('Agents (2)'))).toBe(true);
    expect(calls.some((l) => l.startsWith('Skills (1)'))).toBe(true);
    expect(calls.some((l) => l === '2 agent(s), 1 skill(s) installed.')).toBe(true);
  });

  it('shows [enforced] tag for enforced agents', () => {
    writeAgent(projectDir, 'csharp-coder', 'C# specialist');
    writeManifest(projectDir, { 'csharp-coder': { enforce: true } });

    runList(projectDir);

    const calls = logSpy.mock.calls.map((c) => c[0] as string);
    expect(calls.some((l) => l.includes('csharp-coder') && l.includes('[enforced]'))).toBe(true);
  });

  it('filters out agents not tracked in the manifest', () => {
    writeAgent(projectDir, 'grimoire-agent', 'Grimoire managed');
    writeAgent(projectDir, 'custom-agent', 'User custom agent');
    writeManifest(projectDir, { 'grimoire-agent': {} });

    runList(projectDir);

    const calls = logSpy.mock.calls.map((c) => c[0] as string);
    expect(calls.some((l) => l.includes('grimoire-agent'))).toBe(true);
    expect(calls.some((l) => l.includes('custom-agent'))).toBe(false);
    expect(calls.some((l) => l.startsWith('Agents (1)'))).toBe(true);
  });

  it('filters out skills not tracked in the manifest', () => {
    writeSkill(projectDir, 'grimoire.tdd-specialist', 'TDD skill');
    writeSkill(projectDir, 'browser-testing', 'Custom browser skill');
    writeManifest(projectDir, {}, [
      { name: 'TDD Specialist', path: '.claude/skills/grimoire.tdd-specialist' },
    ]);

    runList(projectDir);

    const calls = logSpy.mock.calls.map((c) => c[0] as string);
    expect(calls.some((l) => l.includes('grimoire.tdd-specialist'))).toBe(true);
    expect(calls.some((l) => l.includes('browser-testing'))).toBe(false);
    expect(calls.some((l) => l.startsWith('Skills (1)'))).toBe(true);
  });
});
