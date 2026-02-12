import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { copyAgent, copySkill, copyItems } from '../src/copy.js';
import type { InstallItem } from '../src/types.js';
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('copyAgent', () => {
  let packDir: string;
  let projectDir: string;

  beforeEach(() => {
    const raw1 = join(tmpdir(), `grimoire-copy-pack-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(raw1, { recursive: true });
    packDir = realpathSync(raw1);

    const raw2 = join(tmpdir(), `grimoire-copy-project-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(raw2, { recursive: true });
    projectDir = realpathSync(raw2);
  });

  afterEach(() => {
    rmSync(packDir, { recursive: true, force: true });
    rmSync(projectDir, { recursive: true, force: true });
  });

  it('should copy single agent .md file to .claude/agents/', () => {
    const agentPath = join(packDir, 'agents', 'my-agent.md');
    mkdirSync(join(packDir, 'agents'), { recursive: true });
    writeFileSync(agentPath, '# My Agent\nContent here.');

    const result = copyAgent(packDir, 'agents/my-agent.md', projectDir);

    const destPath = join(projectDir, '.claude', 'agents', 'my-agent.md');
    expect(result.destinationPath).toBe(destPath);
    expect(result.overwritten).toBe(false);
    expect(readFileSync(destPath, 'utf-8')).toBe('# My Agent\nContent here.');
  });

  it('should create .claude/agents/ directory if it does not exist', () => {
    const agentPath = join(packDir, 'agents', 'new-agent.md');
    mkdirSync(join(packDir, 'agents'), { recursive: true });
    writeFileSync(agentPath, 'content');

    copyAgent(packDir, 'agents/new-agent.md', projectDir);

    expect(existsSync(join(projectDir, '.claude', 'agents'))).toBe(true);
  });

  it('should detect overwrite of existing agent file', () => {
    const agentPath = join(packDir, 'agents', 'existing-agent.md');
    mkdirSync(join(packDir, 'agents'), { recursive: true });
    writeFileSync(agentPath, 'new content');

    const destDir = join(projectDir, '.claude', 'agents');
    mkdirSync(destDir, { recursive: true });
    writeFileSync(join(destDir, 'existing-agent.md'), 'old content');

    const result = copyAgent(packDir, 'agents/existing-agent.md', projectDir);

    expect(result.overwritten).toBe(true);
    expect(readFileSync(result.destinationPath, 'utf-8')).toBe('new content');
  });

  it('should throw on missing source file', () => {
    expect(() =>
      copyAgent(packDir, 'agents/nonexistent.md', projectDir),
    ).toThrow(/not found|ENOENT/i);
  });

  it('should throw on path traversal attempt', () => {
    const outsideFile = join(packDir, '..', 'outside.md');
    writeFileSync(outsideFile, 'evil content');

    expect(() =>
      copyAgent(packDir, '../outside.md', projectDir),
    ).toThrow(/path traversal/i);

    rmSync(outsideFile, { force: true });
  });
});

describe('copySkill', () => {
  let packDir: string;
  let projectDir: string;

  beforeEach(() => {
    const raw1 = join(tmpdir(), `grimoire-copy-pack-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(raw1, { recursive: true });
    packDir = realpathSync(raw1);

    const raw2 = join(tmpdir(), `grimoire-copy-project-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(raw2, { recursive: true });
    projectDir = realpathSync(raw2);
  });

  afterEach(() => {
    rmSync(packDir, { recursive: true, force: true });
    rmSync(projectDir, { recursive: true, force: true });
  });

  it('should copy skill directory recursively to .claude/skills/', () => {
    const skillDir = join(packDir, 'skills', 'my-skill');
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, 'SKILL.md'), '# My Skill');

    const result = copySkill(packDir, 'skills/my-skill', projectDir);

    const destPath = join(projectDir, '.claude', 'skills', 'my-skill');
    expect(result.destinationPath).toBe(destPath);
    expect(result.overwritten).toBe(false);
    expect(readFileSync(join(destPath, 'SKILL.md'), 'utf-8')).toBe('# My Skill');
  });

  it('should create .claude/skills/ directory if it does not exist', () => {
    const skillDir = join(packDir, 'skills', 'new-skill');
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, 'SKILL.md'), 'content');

    copySkill(packDir, 'skills/new-skill', projectDir);

    expect(existsSync(join(projectDir, '.claude', 'skills'))).toBe(true);
  });

  it('should preserve nested files in skill directories', () => {
    const skillDir = join(packDir, 'skills', 'nested-skill');
    mkdirSync(join(skillDir, 'reference'), { recursive: true });
    writeFileSync(join(skillDir, 'SKILL.md'), '# Nested Skill');
    writeFileSync(join(skillDir, 'reference', 'guide.md'), '# Guide');

    copySkill(packDir, 'skills/nested-skill', projectDir);

    const destPath = join(projectDir, '.claude', 'skills', 'nested-skill');
    expect(readFileSync(join(destPath, 'SKILL.md'), 'utf-8')).toBe('# Nested Skill');
    expect(readFileSync(join(destPath, 'reference', 'guide.md'), 'utf-8')).toBe('# Guide');
  });

  it('should detect overwrite of existing skill directory', () => {
    const skillDir = join(packDir, 'skills', 'existing-skill');
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, 'SKILL.md'), 'new content');

    const destDir = join(projectDir, '.claude', 'skills', 'existing-skill');
    mkdirSync(destDir, { recursive: true });
    writeFileSync(join(destDir, 'SKILL.md'), 'old content');

    const result = copySkill(packDir, 'skills/existing-skill', projectDir);

    expect(result.overwritten).toBe(true);
    expect(readFileSync(join(destDir, 'SKILL.md'), 'utf-8')).toBe('new content');
  });
});

describe('copyItems', () => {
  let packDir: string;
  let projectDir: string;

  beforeEach(() => {
    const raw1 = join(tmpdir(), `grimoire-copy-pack-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(raw1, { recursive: true });
    packDir = realpathSync(raw1);

    const raw2 = join(tmpdir(), `grimoire-copy-project-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(raw2, { recursive: true });
    projectDir = realpathSync(raw2);
  });

  afterEach(() => {
    rmSync(packDir, { recursive: true, force: true });
    rmSync(projectDir, { recursive: true, force: true });
  });

  it('should copy mixed list of agents and skills', () => {
    mkdirSync(join(packDir, 'agents'), { recursive: true });
    writeFileSync(join(packDir, 'agents', 'a.md'), 'agent');

    mkdirSync(join(packDir, 'skills', 'sk'), { recursive: true });
    writeFileSync(join(packDir, 'skills', 'sk', 'SKILL.md'), 'skill');

    const items: readonly InstallItem[] = [
      { type: 'agent', name: 'a', sourcePath: 'agents/a.md', description: 'Agent A' },
      { type: 'skill', name: 'sk', sourcePath: 'skills/sk', description: 'Skill SK' },
    ];

    const results = copyItems(items, packDir, projectDir);

    expect(results).toHaveLength(2);
    expect(existsSync(join(projectDir, '.claude', 'agents', 'a.md'))).toBe(true);
    expect(existsSync(join(projectDir, '.claude', 'skills', 'sk', 'SKILL.md'))).toBe(true);
  });
});
