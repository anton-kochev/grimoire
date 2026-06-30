import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { mergeSettings, mergeManifest, setupRouter } from '../src/setup.js';
import type { PackManifest } from '../src/types.js';

function makeTmpDir(prefix: string): string {
  const raw = join(tmpdir(), `grimoire-setup-${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(raw, { recursive: true });
  return realpathSync(raw);
}

function readJson(filePath: string): unknown {
  return JSON.parse(readFileSync(filePath, 'utf-8'));
}

const sampleManifest: PackManifest = {
  name: 'test-pack',
  version: '1.0.0',
  agents: [
    { name: 'csharp-coder', path: 'agents/csharp-coder.md', description: 'C# coder agent' },
  ],
  skills: [
    { name: 'dotnet-testing', path: 'skills/dotnet-testing', description: 'Unit testing for .NET' },
    { name: 'readme-guide', path: 'skills/readme-guide', description: 'README writing guide' },
    { name: 'plain-skill', path: 'skills/plain-skill', description: 'Plain skill' },
  ],
};

describe('mergeSettings', () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = makeTmpDir('settings');
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  it('should no-op on a fresh project', () => {
    mergeSettings(projectDir);

    expect(existsSync(join(projectDir, '.claude', 'settings.local.json'))).toBe(false);
  });

  it('should remove legacy bare matching hooks and preserve other hooks', () => {
    const settingsDir = join(projectDir, '.claude');
    mkdirSync(settingsDir, { recursive: true });
    writeFileSync(
      join(settingsDir, 'settings.local.json'),
      JSON.stringify({
        hooks: {
          UserPromptSubmit: [
            { matcher: '', hooks: [{ type: 'command', command: 'npx @grimoire-cc/router' }] },
            { matcher: '', hooks: [{ type: 'command', command: 'echo existing' }] },
          ],
          PreToolUse: [
            { matcher: 'Edit|Write|MultiEdit', hooks: [{ type: 'command', command: 'npx @grimoire-cc/router' }] },
            { matcher: 'Edit|Write|MultiEdit', hooks: [{ type: 'command', command: 'npx @grimoire-cc/router --enforce' }] },
          ],
        },
      }),
    );

    mergeSettings(projectDir);

    const settings = readJson(join(settingsDir, 'settings.local.json')) as Record<string, unknown>;
    const hooks = settings['hooks'] as Record<string, Array<{ hooks: Array<{ command: string }> }>>;

    expect(hooks['UserPromptSubmit']).toHaveLength(1);
    expect(hooks['UserPromptSubmit']![0]!.hooks[0]!.command).toBe('echo existing');
    expect(hooks['PreToolUse']).toHaveLength(1);
    expect(hooks['PreToolUse']![0]!.hooks[0]!.command).toContain('--enforce');
  });

  it('should preserve non-hook settings fields', () => {
    const settingsDir = join(projectDir, '.claude');
    mkdirSync(settingsDir, { recursive: true });
    writeFileSync(
      join(settingsDir, 'settings.local.json'),
      JSON.stringify({ permissions: { allow: ['Read'] }, hooks: {} }),
    );

    mergeSettings(projectDir);

    const settings = readJson(join(settingsDir, 'settings.local.json')) as Record<string, unknown>;
    expect(settings['permissions']).toEqual({ allow: ['Read'] });
    expect(settings['hooks']).toBeUndefined();
  });
});

describe('mergeManifest', () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = makeTmpDir('manifest');
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  it('should create grimoire.json with router metadata and skills from pack on fresh project', () => {
    mergeManifest(projectDir, sampleManifest);

    const configPath = join(projectDir, '.claude', 'grimoire.json');
    expect(existsSync(configPath)).toBe(true);

    const config = readJson(configPath) as Record<string, unknown>;
    const router = config['router'] as Record<string, unknown>;
    expect(router['version']).toBe('2.0.0');
    expect(router['config']).toBeUndefined();

    const skills = router['skills'] as Array<{ path: string; name: string; triggers?: unknown }>;
    expect(skills).toHaveLength(3);
    expect(skills.map(s => s.name)).toEqual(['dotnet-testing', 'readme-guide', 'plain-skill']);
    expect(skills.every((s) => s.triggers === undefined)).toBe(true);
  });

  it('should preserve existing config while appending new skills', () => {
    const claudeDir = join(projectDir, '.claude');
    mkdirSync(claudeDir, { recursive: true });
    writeFileSync(
      join(claudeDir, 'grimoire.json'),
      JSON.stringify({
        router: {
          version: '2.0.0',
          config: { custom: true },
          skills: [{ path: '.claude/skills/existing-skill', name: 'existing-skill' }],
          agents: {},
        },
      }),
    );

    mergeManifest(projectDir, sampleManifest);

    const config = readJson(join(claudeDir, 'grimoire.json')) as Record<string, unknown>;
    const router = config['router'] as Record<string, unknown>;
    expect(router['config']).toEqual({ custom: true });

    const skills = router['skills'] as Array<{ path: string; name: string }>;
    expect(skills).toHaveLength(4);
    expect(skills[0]!.name).toBe('existing-skill');
    expect(skills[1]!.name).toBe('dotnet-testing');
  });

  it('should update skill metadata by path without preserving legacy triggers', () => {
    const claudeDir = join(projectDir, '.claude');
    mkdirSync(claudeDir, { recursive: true });
    writeFileSync(
      join(claudeDir, 'grimoire.json'),
      JSON.stringify({
        router: {
          version: '2.0.0',
          config: {},
          skills: [{ path: '.claude/skills/dotnet-testing', name: 'old-name', triggers: { keywords: ['old'] } }],
          agents: {},
        },
      }),
    );

    mergeManifest(projectDir, sampleManifest);

    const config = readJson(join(claudeDir, 'grimoire.json')) as Record<string, unknown>;
    const router = config['router'] as Record<string, unknown>;
    const skills = router['skills'] as Array<{ path: string; name: string; triggers?: unknown }>;
    const dotnetSkills = skills.filter(s => s.path === '.claude/skills/dotnet-testing');
    expect(dotnetSkills).toHaveLength(1);
    expect(dotnetSkills[0]!.name).toBe('dotnet-testing');
    expect(dotnetSkills[0]!.triggers).toBeUndefined();
  });

  it('should create empty agent entry when pack agent has no file_patterns', () => {
    mergeManifest(projectDir, { ...sampleManifest, skills: [] });

    const config = readJson(join(projectDir, '.claude', 'grimoire.json')) as Record<string, unknown>;
    const router = config['router'] as Record<string, unknown>;
    const agents = router['agents'] as Record<string, unknown>;
    expect(agents['csharp-coder']).toEqual({});
  });

  it('should write file_patterns from pack agent entry', () => {
    mergeManifest(projectDir, {
      ...sampleManifest,
      agents: [{ name: 'grimoire.typescript-coder', path: 'agents/grimoire.typescript-coder.md', description: 'TS coder', file_patterns: ['*.ts', '*.tsx'] }],
      skills: [],
    });

    const config = readJson(join(projectDir, '.claude', 'grimoire.json')) as Record<string, unknown>;
    const router = config['router'] as Record<string, unknown>;
    const agents = router['agents'] as Record<string, unknown>;
    const entry = agents['grimoire.typescript-coder'] as Record<string, unknown>;
    expect(entry['file_patterns']).toEqual(['*.ts', '*.tsx']);
  });

  it('should strip leftover enforce flag when reinstalling agent', () => {
    const claudeDir = join(projectDir, '.claude');
    mkdirSync(claudeDir, { recursive: true });
    writeFileSync(
      join(claudeDir, 'grimoire.json'),
      JSON.stringify({ router: { version: '2.0.0', config: {}, skills: [], agents: { 'grimoire.typescript-coder': { file_patterns: ['*.ts'], enforce: true } } } }),
    );

    mergeManifest(projectDir, {
      ...sampleManifest,
      agents: [{ name: 'grimoire.typescript-coder', path: 'agents/grimoire.typescript-coder.md', description: 'TS coder', file_patterns: ['*.ts', '*.tsx'] }],
      skills: [],
    });

    const config = readJson(join(projectDir, '.claude', 'grimoire.json')) as Record<string, unknown>;
    const router = config['router'] as Record<string, unknown>;
    const agents = router['agents'] as Record<string, unknown>;
    const entry = agents['grimoire.typescript-coder'] as Record<string, unknown>;
    expect(entry['file_patterns']).toEqual(['*.ts', '*.tsx']);
    expect(entry['enforce']).toBeUndefined();
  });

  it('should use directory name from path (not name) for skill path in router', () => {
    mergeManifest(projectDir, {
      name: 'test-pack',
      version: '1.0.0',
      agents: [],
      skills: [{ name: 'grimoire.modern-typescript', path: 'skills/gr.modern-typescript', description: 'TS skill' }],
    });

    const config = readJson(join(projectDir, '.claude', 'grimoire.json')) as Record<string, unknown>;
    const router = config['router'] as Record<string, unknown>;
    const skills = router['skills'] as Array<{ path: string; name: string }>;
    expect(skills[0]!.path).toBe('.claude/skills/gr.modern-typescript');
    expect(skills[0]!.name).toBe('grimoire.modern-typescript');
  });
});

describe('setupRouter', () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = makeTmpDir('router');
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  it('should create grimoire.json with router key without writing any hooks', () => {
    setupRouter(projectDir, sampleManifest);

    expect(existsSync(join(projectDir, '.claude', 'grimoire.json'))).toBe(true);
    // Skill injection is native (skills: frontmatter) — install writes no hooks,
    // so settings.local.json is not created on a fresh project
    expect(existsSync(join(projectDir, '.claude', 'settings.local.json'))).toBe(false);
  });

  it('should not add subagent hooks to existing settings.local.json', () => {
    const claudeDir = join(projectDir, '.claude');
    mkdirSync(claudeDir, { recursive: true });
    writeFileSync(
      join(claudeDir, 'settings.local.json'),
      JSON.stringify({ hooks: { PreToolUse: [{ matcher: 'Edit', hooks: [{ type: 'command', command: 'npx @grimoire-cc/router --enforce' }] }] } }),
    );

    setupRouter(projectDir, sampleManifest);

    const settings = readJson(join(claudeDir, 'settings.local.json')) as Record<string, unknown>;
    const hooks = settings['hooks'] as Record<string, unknown[]>;
    expect(hooks['SubagentStart']).toBeUndefined();
    expect(hooks['SubagentStop']).toBeUndefined();
    expect(hooks['PreToolUse']).toHaveLength(1);
  });
});
