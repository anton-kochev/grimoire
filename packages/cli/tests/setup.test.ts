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
    {
      name: 'dotnet-testing',
      path: 'skills/dotnet-testing',
      description: 'Unit testing for .NET',
      triggers: {
        keywords: ['unittest', 'xunit'],
        file_extensions: ['.cs'],
        patterns: ['write.*test'],
        file_paths: ['tests/**'],
      },
    },
    {
      name: 'readme-guide',
      path: 'skills/readme-guide',
      description: 'README writing guide',
      triggers: {
        keywords: ['readme'],
        file_extensions: [],
        patterns: ['create.*readme'],
        file_paths: [],
      },
    },
    {
      name: 'no-triggers-skill',
      path: 'skills/no-triggers',
      description: 'Skill without triggers',
    },
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

  it('should create settings.json with hook entries on fresh project', () => {
    mergeSettings(projectDir);

    const settingsPath = join(projectDir, '.claude', 'settings.json');
    expect(existsSync(settingsPath)).toBe(true);

    const settings = readJson(settingsPath) as Record<string, unknown>;
    const hooks = settings['hooks'] as Record<string, unknown[]>;

    expect(hooks['UserPromptSubmit']).toBeDefined();
    expect(hooks['PreToolUse']).toBeDefined();

    const userPromptHooks = hooks['UserPromptSubmit'] as Array<{ matcher: string; hooks: Array<{ type: string; command: string }> }>;
    expect(userPromptHooks).toHaveLength(1);
    expect(userPromptHooks[0]!.matcher).toBe('');
    expect(userPromptHooks[0]!.hooks[0]!.command).toContain('@grimoire-cc/router');

    const preToolHooks = hooks['PreToolUse'] as Array<{ matcher: string; hooks: Array<{ type: string; command: string }> }>;
    expect(preToolHooks).toHaveLength(1);
    expect(preToolHooks[0]!.matcher).toBe('Edit|Write|MultiEdit');
    expect(preToolHooks[0]!.hooks[0]!.command).toContain('@grimoire-cc/router');
  });

  it('should preserve existing hooks and append @grimoire-cc/router entries', () => {
    const settingsDir = join(projectDir, '.claude');
    mkdirSync(settingsDir, { recursive: true });
    writeFileSync(
      join(settingsDir, 'settings.json'),
      JSON.stringify({
        hooks: {
          UserPromptSubmit: [
            { matcher: '', hooks: [{ type: 'command', command: 'echo existing' }] },
          ],
        },
      }),
    );

    mergeSettings(projectDir);

    const settings = readJson(join(settingsDir, 'settings.json')) as Record<string, unknown>;
    const hooks = settings['hooks'] as Record<string, unknown[]>;

    // Existing hook preserved + @grimoire-cc/router appended
    const userPromptHooks = hooks['UserPromptSubmit'] as Array<{ matcher: string; hooks: Array<{ type: string; command: string }> }>;
    expect(userPromptHooks).toHaveLength(2);
    expect(userPromptHooks[0]!.hooks[0]!.command).toBe('echo existing');
    expect(userPromptHooks[1]!.hooks[0]!.command).toContain('@grimoire-cc/router');

    // PreToolUse created fresh
    expect(hooks['PreToolUse']).toHaveLength(1);
  });

  it('should not duplicate if @grimoire-cc/router hooks already present', () => {
    const settingsDir = join(projectDir, '.claude');
    mkdirSync(settingsDir, { recursive: true });
    writeFileSync(
      join(settingsDir, 'settings.json'),
      JSON.stringify({
        hooks: {
          UserPromptSubmit: [
            { matcher: '', hooks: [{ type: 'command', command: 'npx @grimoire-cc/@grimoire-cc/router' }] },
          ],
          PreToolUse: [
            { matcher: 'Edit|Write|MultiEdit', hooks: [{ type: 'command', command: 'npx @grimoire-cc/@grimoire-cc/router' }] },
          ],
        },
      }),
    );

    mergeSettings(projectDir);

    const settings = readJson(join(settingsDir, 'settings.json')) as Record<string, unknown>;
    const hooks = settings['hooks'] as Record<string, unknown[]>;

    expect(hooks['UserPromptSubmit']).toHaveLength(1);
    expect(hooks['PreToolUse']).toHaveLength(1);
  });

  it('should preserve non-hook settings fields', () => {
    const settingsDir = join(projectDir, '.claude');
    mkdirSync(settingsDir, { recursive: true });
    writeFileSync(
      join(settingsDir, 'settings.json'),
      JSON.stringify({ permissions: { allow: ['Read'] }, hooks: {} }),
    );

    mergeSettings(projectDir);

    const settings = readJson(join(settingsDir, 'settings.json')) as Record<string, unknown>;
    expect(settings['permissions']).toEqual({ allow: ['Read'] });
    expect(settings['hooks']).toBeDefined();
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

  it('should create grimoire.json with default router config and skills from pack on fresh project', () => {
    mergeManifest(projectDir, sampleManifest);

    const configPath = join(projectDir, '.claude', 'grimoire.json');
    expect(existsSync(configPath)).toBe(true);

    const config = readJson(configPath) as Record<string, unknown>;
    const router = config['router'] as Record<string, unknown>;
    expect(router['version']).toBe('2.0.0');

    const routerConfig = router['config'] as Record<string, unknown>;
    expect(routerConfig['activation_threshold']).toBe(3.0);

    // All skills are included (with and without triggers)
    const skills = router['skills'] as Array<{ path: string; name: string }>;
    expect(skills).toHaveLength(3);
    expect(skills.map(s => s.name)).toEqual(['dotnet-testing', 'readme-guide', 'no-triggers-skill']);
  });

  it('should preserve existing skills and append new ones', () => {
    const claudeDir = join(projectDir, '.claude');
    mkdirSync(claudeDir, { recursive: true });
    writeFileSync(
      join(claudeDir, 'grimoire.json'),
      JSON.stringify({
        router: {
          version: '2.0.0',
          config: { activation_threshold: 5.0 },
          skills: [
            {
              path: '.claude/skills/existing-skill',
              name: 'existing-skill',
              triggers: { keywords: ['existing'] },
            },
          ],
          agents: {},
        },
      }),
    );

    mergeManifest(projectDir, sampleManifest);

    const config = readJson(join(claudeDir, 'grimoire.json')) as Record<string, unknown>;
    const router = config['router'] as Record<string, unknown>;

    // Existing config preserved
    const routerConfig = router['config'] as Record<string, unknown>;
    expect(routerConfig['activation_threshold']).toBe(5.0);

    // Existing skill + 3 new skills (including one without triggers)
    const skills = router['skills'] as Array<{ path: string; name: string }>;
    expect(skills).toHaveLength(4);
    expect(skills[0]!.name).toBe('existing-skill');
    expect(skills[1]!.name).toBe('dotnet-testing');
    expect(skills[2]!.name).toBe('readme-guide');
    expect(skills[3]!.name).toBe('no-triggers-skill');
  });

  it('should update triggers for skill that already exists by path', () => {
    const claudeDir = join(projectDir, '.claude');
    mkdirSync(claudeDir, { recursive: true });
    writeFileSync(
      join(claudeDir, 'grimoire.json'),
      JSON.stringify({
        router: {
          version: '2.0.0',
          config: {},
          skills: [
            {
              path: '.claude/skills/dotnet-testing',
              name: 'dotnet-testing',
              triggers: { keywords: ['old-keyword'] },
            },
          ],
          agents: {},
        },
      }),
    );

    mergeManifest(projectDir, sampleManifest);

    const config = readJson(join(claudeDir, 'grimoire.json')) as Record<string, unknown>;
    const router = config['router'] as Record<string, unknown>;
    const skills = router['skills'] as Array<{ path: string; name: string; triggers: { keywords: string[] } }>;

    // Should not duplicate — just update
    const dotnetSkills = skills.filter(s => s.path === '.claude/skills/dotnet-testing');
    expect(dotnetSkills).toHaveLength(1);
    expect(dotnetSkills[0]!.triggers.keywords).toEqual(['unittest', 'xunit']);
  });

  it('should create empty agent entry when pack agent has no file_patterns', () => {
    mergeManifest(projectDir, {
      ...sampleManifest,
      agents: [
        { name: 'csharp-coder', path: 'agents/csharp-coder.md', description: 'C# coder' },
      ],
      skills: [],
    });

    const config = readJson(join(projectDir, '.claude', 'grimoire.json')) as Record<string, unknown>;
    const router = config['router'] as Record<string, unknown>;
    const agents = router['agents'] as Record<string, unknown>;

    expect(agents['csharp-coder']).toBeDefined();
    expect(agents['csharp-coder']).toEqual({});
  });

  it('should write file_patterns from pack agent entry', () => {
    mergeManifest(projectDir, {
      ...sampleManifest,
      agents: [
        {
          name: 'grimoire.typescript-coder',
          path: 'agents/grimoire.typescript-coder.md',
          description: 'TS coder',
          file_patterns: ['*.ts', '*.tsx'],
        },
      ],
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
      JSON.stringify({
        router: {
          version: '2.0.0',
          config: {},
          skills: [],
          agents: {
            'grimoire.typescript-coder': { file_patterns: ['*.ts'], enforce: true },
          },
        },
      }),
    );

    mergeManifest(projectDir, {
      ...sampleManifest,
      agents: [
        {
          name: 'grimoire.typescript-coder',
          path: 'agents/grimoire.typescript-coder.md',
          description: 'TS coder',
          file_patterns: ['*.ts', '*.tsx'],
        },
      ],
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
    const packWithPrefixedName: PackManifest = {
      name: 'test-pack',
      version: '1.0.0',
      agents: [],
      skills: [
        {
          name: 'grimoire.modern-typescript',
          path: 'skills/gr.modern-typescript',
          description: 'TS skill',
          triggers: {
            keywords: ['typescript'],
            file_extensions: ['.ts'],
            patterns: [],
            file_paths: [],
          },
        },
      ],
    };

    mergeManifest(projectDir, packWithPrefixedName);

    const config = readJson(join(projectDir, '.claude', 'grimoire.json')) as Record<string, unknown>;
    const router = config['router'] as Record<string, unknown>;
    const skills = router['skills'] as Array<{ path: string; name: string }>;

    expect(skills).toHaveLength(1);
    expect(skills[0]!.path).toBe('.claude/skills/gr.modern-typescript');
    expect(skills[0]!.name).toBe('grimoire.modern-typescript');
  });

  it('should register skills without triggers', () => {
    const manifestWithNoTriggers: PackManifest = {
      name: 'test-pack',
      version: '1.0.0',
      agents: [],
      skills: [
        { name: 'no-triggers', path: 'skills/no-triggers', description: 'No triggers' },
      ],
    };

    mergeManifest(projectDir, manifestWithNoTriggers);

    const config = readJson(join(projectDir, '.claude', 'grimoire.json')) as Record<string, unknown>;
    const router = config['router'] as Record<string, unknown>;
    const skills = router['skills'] as Array<{ path: string; name: string; triggers: unknown }>;
    expect(skills).toHaveLength(1);
    expect(skills[0]!.name).toBe('no-triggers');
    expect(skills[0]!.path).toBe('.claude/skills/no-triggers');
    expect(skills[0]!.triggers).toEqual({});
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

  it('should create both settings.json and grimoire.json with router key', () => {
    setupRouter(projectDir, sampleManifest);

    expect(existsSync(join(projectDir, '.claude', 'settings.json'))).toBe(true);
    expect(existsSync(join(projectDir, '.claude', 'grimoire.json'))).toBe(true);
    const config = readJson(join(projectDir, '.claude', 'grimoire.json')) as Record<string, unknown>;
    expect(config['router']).toBeDefined();
  });
});
