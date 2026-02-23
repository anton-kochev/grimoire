import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readSkillBody } from '../src/skill-content.js';
import { mkdirSync, writeFileSync, rmSync, realpathSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('readSkillBody', () => {
  let testDir: string;

  beforeEach(() => {
    const raw = join(tmpdir(), `skill-content-${Date.now()}`);
    mkdirSync(raw, { recursive: true });
    testDir = realpathSync(raw);
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('should return body content after YAML frontmatter', () => {
    const skillDir = join(testDir, '.claude', 'skills', 'my-skill');
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(
      join(skillDir, 'SKILL.md'),
      '---\nname: my-skill\ndescription: "A test skill"\n---\n\n# My Skill\n\nThis is the body.'
    );

    const result = readSkillBody('.claude/skills/my-skill', testDir);

    expect(result).toBe('# My Skill\n\nThis is the body.');
  });

  it('should return null for missing file', () => {
    const result = readSkillBody('.claude/skills/nonexistent', testDir);

    expect(result).toBeNull();
  });

  it('should return full content when no frontmatter present', () => {
    const skillDir = join(testDir, '.claude', 'skills', 'no-fm');
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(
      join(skillDir, 'SKILL.md'),
      '# No Frontmatter\n\nJust content.'
    );

    const result = readSkillBody('.claude/skills/no-fm', testDir);

    expect(result).toBe('# No Frontmatter\n\nJust content.');
  });

  it('should return null when body is empty after frontmatter', () => {
    const skillDir = join(testDir, '.claude', 'skills', 'empty-body');
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(
      join(skillDir, 'SKILL.md'),
      '---\nname: empty-body\ndescription: "Empty"\n---\n'
    );

    const result = readSkillBody('.claude/skills/empty-body', testDir);

    expect(result).toBeNull();
  });

  it('should return null when file has only frontmatter delimiters', () => {
    const skillDir = join(testDir, '.claude', 'skills', 'only-fm');
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(
      join(skillDir, 'SKILL.md'),
      '---\nname: only-fm\n---'
    );

    const result = readSkillBody('.claude/skills/only-fm', testDir);

    expect(result).toBeNull();
  });

  it('should return null when body is only whitespace after frontmatter', () => {
    const skillDir = join(testDir, '.claude', 'skills', 'whitespace');
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(
      join(skillDir, 'SKILL.md'),
      '---\nname: whitespace\n---\n\n   \n\n'
    );

    const result = readSkillBody('.claude/skills/whitespace', testDir);

    expect(result).toBeNull();
  });

  it('should handle multiline frontmatter with description', () => {
    const skillDir = join(testDir, '.claude', 'skills', 'multi-fm');
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(
      join(skillDir, 'SKILL.md'),
      '---\nname: multi-fm\ndescription: "A skill with a long description that spans context"\n---\n\n# Multi\n\nBody here.'
    );

    const result = readSkillBody('.claude/skills/multi-fm', testDir);

    expect(result).toBe('# Multi\n\nBody here.');
  });

  it('should never throw on any error', () => {
    // Invalid projectDir
    expect(() => readSkillBody('some/path', '/nonexistent/dir')).not.toThrow();
    expect(readSkillBody('some/path', '/nonexistent/dir')).toBeNull();
  });
});
