import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { listDefinedAgentTypes, resolveAgentDefPath } from '../src/agent-defs.js';

function makeTmpDir(label: string): string {
  const raw = join(tmpdir(), `grimoire-agent-defs-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(raw, { recursive: true });
  return realpathSync(raw);
}

describe('agent definition lookup', () => {
  let cwd: string;
  let userDir: string;

  beforeEach(() => {
    cwd = makeTmpDir('project');
    userDir = makeTmpDir('user');
  });

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
    rmSync(userDir, { recursive: true, force: true });
  });

  function addProjectAgent(name: string): string {
    const dir = join(cwd, '.claude', 'agents');
    mkdirSync(dir, { recursive: true });
    const p = join(dir, `${name}.md`);
    writeFileSync(p, `---\nname: ${name}\n---\nprompt`);
    return p;
  }

  function addUserAgent(name: string): string {
    mkdirSync(userDir, { recursive: true });
    const p = join(userDir, `${name}.md`);
    writeFileSync(p, `---\nname: ${name}\n---\nprompt`);
    return p;
  }

  describe('listDefinedAgentTypes', () => {
    it('merges project-level and user-level agent names', () => {
      addProjectAgent('grimoire.typescript-coder');
      addUserAgent('content-crafter');

      const names = listDefinedAgentTypes(cwd, userDir);

      expect(names).toEqual(new Set(['grimoire.typescript-coder', 'content-crafter']));
    });

    it('ignores files that are not .md definitions', () => {
      addProjectAgent('grimoire.typescript-coder');
      writeFileSync(join(cwd, '.claude', 'agents', 'notes.txt'), 'not an agent');

      const names = listDefinedAgentTypes(cwd, userDir);

      expect(names).toEqual(new Set(['grimoire.typescript-coder']));
    });

    it('returns an empty set when neither directory exists', () => {
      const names = listDefinedAgentTypes(join(cwd, 'nope'), join(userDir, 'nope'));

      expect(names.size).toBe(0);
    });
  });

  describe('resolveAgentDefPath', () => {
    it('prefers the project definition over the user one', () => {
      const projectPath = addProjectAgent('grimoire.typescript-coder');
      addUserAgent('grimoire.typescript-coder');

      expect(resolveAgentDefPath(cwd, 'grimoire.typescript-coder', userDir)).toBe(projectPath);
    });

    it('falls back to the user-level definition', () => {
      const userPath = addUserAgent('content-crafter');

      expect(resolveAgentDefPath(cwd, 'content-crafter', userDir)).toBe(userPath);
    });

    it('returns null for a built-in agent with no definition anywhere', () => {
      expect(resolveAgentDefPath(cwd, 'Explore', userDir)).toBe(null);
    });
  });
});
