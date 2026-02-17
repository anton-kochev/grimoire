import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { scanInstalled, removeItems, cleanManifest, resolvePackItems } from '../src/remove.js';
import { runRemove, runRemovePack } from '../src/commands/remove.js';
import type { InstallItem, PackManifest } from '../src/types.js';

function makeTmpDir(prefix: string): string {
  const raw = join(tmpdir(), `grimoire-remove-${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(raw, { recursive: true });
  return realpathSync(raw);
}

function readJson(filePath: string): unknown {
  return JSON.parse(readFileSync(filePath, 'utf-8'));
}

function setupProject(projectDir: string): void {
  const agentsDir = join(projectDir, '.claude', 'agents');
  const skillsDir = join(projectDir, '.claude', 'skills');

  mkdirSync(agentsDir, { recursive: true });
  writeFileSync(join(agentsDir, 'csharp-coder.md'), '# C# Coder');
  writeFileSync(join(agentsDir, 'dotnet-architect.md'), '# Architect');

  mkdirSync(join(skillsDir, 'dotnet-testing'), { recursive: true });
  writeFileSync(join(skillsDir, 'dotnet-testing', 'SKILL.md'), '# Testing');

  mkdirSync(join(skillsDir, 'readme-guide'), { recursive: true });
  writeFileSync(join(skillsDir, 'readme-guide', 'SKILL.md'), '# README');
}

function setupManifest(projectDir: string): void {
  const manifestPath = join(projectDir, '.claude', 'skills-manifest.json');
  writeFileSync(
    manifestPath,
    JSON.stringify({
      version: '2.0.0',
      config: {},
      skills: [
        {
          path: '.claude/skills/dotnet-testing',
          name: 'dotnet-testing',
          triggers: { keywords: ['test'] },
        },
        {
          path: '.claude/skills/readme-guide',
          name: 'readme-guide',
          triggers: { keywords: ['readme'] },
        },
      ],
      agents: {
        'csharp-coder': {
          always_skills: [],
          compatible_skills: ['dotnet-testing'],
        },
        'dotnet-architect': {
          always_skills: ['dotnet-testing'],
          compatible_skills: ['readme-guide'],
        },
      },
    }),
  );
}

/** Sets up a project with namespaced pack names (like real grimoire installs) */
function setupNamespacedProject(projectDir: string): void {
  const agentsDir = join(projectDir, '.claude', 'agents');
  const skillsDir = join(projectDir, '.claude', 'skills');

  mkdirSync(agentsDir, { recursive: true });
  writeFileSync(join(agentsDir, 'gr.csharp-code-reviewer.md'), '# Reviewer');
  writeFileSync(join(agentsDir, 'gr.csharp-coder.md'), '# Coder');

  mkdirSync(join(skillsDir, 'gr.dotnet-feature-workflow'), { recursive: true });
  writeFileSync(join(skillsDir, 'gr.dotnet-feature-workflow', 'SKILL.md'), '# Workflow');
}

function setupNamespacedManifest(projectDir: string): void {
  const manifestPath = join(projectDir, '.claude', 'skills-manifest.json');
  writeFileSync(
    manifestPath,
    JSON.stringify({
      version: '2.0.0',
      config: {},
      skills: [
        {
          path: '.claude/skills/gr.dotnet-feature-workflow',
          name: 'grimoire:dotnet-feature-workflow',
          description: 'Workflow skill',
          triggers: { keywords: ['feature'] },
        },
      ],
      agents: {
        'grimoire:csharp-code-reviewer': {
          always_skills: [],
          compatible_skills: ['grimoire:dotnet-feature-workflow'],
        },
        'grimoire:csharp-coder': {
          always_skills: ['grimoire:dotnet-feature-workflow'],
          compatible_skills: [],
        },
      },
    }),
  );
}

const FAKE_PACK_MANIFEST: PackManifest = {
  name: 'dotnet-pack',
  version: '1.0.0',
  agents: [
    { name: 'grimoire:csharp-code-reviewer', path: 'agents/gr.csharp-code-reviewer.md', description: 'Reviewer' },
    { name: 'grimoire:csharp-coder', path: 'agents/gr.csharp-coder.md', description: 'Coder' },
  ],
  skills: [
    { name: 'grimoire:dotnet-feature-workflow', path: 'skills/gr.dotnet-feature-workflow', description: 'Workflow' },
  ],
};

describe('scanInstalled', () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = makeTmpDir('scan');
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  it('should find agents and skills', () => {
    setupProject(projectDir);

    const items = scanInstalled(projectDir);

    const agents = items.filter((i) => i.type === 'agent');
    const skills = items.filter((i) => i.type === 'skill');

    expect(agents).toHaveLength(2);
    expect(agents.map((a) => a.name).sort()).toEqual(['csharp-coder', 'dotnet-architect']);

    expect(skills).toHaveLength(2);
    expect(skills.map((s) => s.name).sort()).toEqual(['dotnet-testing', 'readme-guide']);
  });

  it('should return empty array for empty project', () => {
    const items = scanInstalled(projectDir);
    expect(items).toEqual([]);
  });
});

describe('removeItems', () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = makeTmpDir('remove-items');
    setupProject(projectDir);
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  it('should remove agent file', () => {
    const items: InstallItem[] = [
      { type: 'agent', name: 'csharp-coder', sourcePath: '', description: '' },
    ];

    const results = removeItems(items, projectDir);

    expect(results).toHaveLength(1);
    expect(results[0]!.removed).toBe(true);
    expect(existsSync(join(projectDir, '.claude', 'agents', 'csharp-coder.md'))).toBe(false);
    // Other agent untouched
    expect(existsSync(join(projectDir, '.claude', 'agents', 'dotnet-architect.md'))).toBe(true);
  });

  it('should remove skill directory recursively', () => {
    const items: InstallItem[] = [
      { type: 'skill', name: 'dotnet-testing', sourcePath: '', description: '' },
    ];

    const results = removeItems(items, projectDir);

    expect(results).toHaveLength(1);
    expect(results[0]!.removed).toBe(true);
    expect(existsSync(join(projectDir, '.claude', 'skills', 'dotnet-testing'))).toBe(false);
    // Other skill untouched
    expect(existsSync(join(projectDir, '.claude', 'skills', 'readme-guide', 'SKILL.md'))).toBe(true);
  });

  it('should return removed=false for nonexistent item', () => {
    const items: InstallItem[] = [
      { type: 'agent', name: 'nonexistent', sourcePath: '', description: '' },
    ];

    const results = removeItems(items, projectDir);

    expect(results).toHaveLength(1);
    expect(results[0]!.removed).toBe(false);
  });
});

describe('cleanManifest', () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = makeTmpDir('clean-manifest');
    mkdirSync(join(projectDir, '.claude'), { recursive: true });
    setupManifest(projectDir);
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  it('should remove skill from manifest', () => {
    const items: InstallItem[] = [
      { type: 'skill', name: 'dotnet-testing', sourcePath: '', description: '' },
    ];

    cleanManifest(items, projectDir);

    const manifest = readJson(join(projectDir, '.claude', 'skills-manifest.json')) as {
      skills: Array<{ name: string }>;
    };
    expect(manifest.skills).toHaveLength(1);
    expect(manifest.skills[0]!.name).toBe('readme-guide');
  });

  it('should remove agent from manifest', () => {
    const items: InstallItem[] = [
      { type: 'agent', name: 'csharp-coder', sourcePath: '', description: '' },
    ];

    cleanManifest(items, projectDir);

    const manifest = readJson(join(projectDir, '.claude', 'skills-manifest.json')) as {
      agents: Record<string, unknown>;
    };
    expect(manifest.agents['csharp-coder']).toBeUndefined();
    expect(manifest.agents['dotnet-architect']).toBeDefined();
  });

  it('should remove agent references from other agents', () => {
    const items: InstallItem[] = [
      { type: 'skill', name: 'dotnet-testing', sourcePath: '', description: '' },
    ];

    cleanManifest(items, projectDir);

    const manifest = readJson(join(projectDir, '.claude', 'skills-manifest.json')) as {
      agents: Record<string, { always_skills: string[]; compatible_skills: string[] }>;
    };
    // dotnet-testing removed from both agents' skill lists
    expect(manifest.agents['csharp-coder']!.compatible_skills).not.toContain('dotnet-testing');
    expect(manifest.agents['dotnet-architect']!.always_skills).not.toContain('dotnet-testing');
  });

  it('should be a no-op when manifest file does not exist', () => {
    rmSync(join(projectDir, '.claude', 'skills-manifest.json'));

    const items: InstallItem[] = [
      { type: 'skill', name: 'dotnet-testing', sourcePath: '', description: '' },
    ];

    // Should not throw
    expect(() => cleanManifest(items, projectDir)).not.toThrow();
  });
});

describe('runRemove', () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = makeTmpDir('run-remove');
    setupProject(projectDir);
    setupManifest(projectDir);
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  it('should remove specific item by name', async () => {
    const summary = await runRemove('csharp-coder', projectDir);

    expect(summary.results).toHaveLength(1);
    expect(summary.results[0]!.item.name).toBe('csharp-coder');
    expect(summary.results[0]!.removed).toBe(true);
    expect(existsSync(join(projectDir, '.claude', 'agents', 'csharp-coder.md'))).toBe(false);
  });

  it('should throw when item not found', async () => {
    await expect(
      runRemove('nonexistent', projectDir),
    ).rejects.toThrow(/not found.*nonexistent/i);
  });

  it('should throw when no items installed', async () => {
    const emptyDir = makeTmpDir('empty');

    await expect(
      runRemove('anything', emptyDir),
    ).rejects.toThrow(/no agents or skills/i);

    rmSync(emptyDir, { recursive: true, force: true });
  });

  it('should clean manifest when removing skill', async () => {
    await runRemove('dotnet-testing', projectDir);

    const manifest = readJson(join(projectDir, '.claude', 'skills-manifest.json')) as {
      skills: Array<{ name: string }>;
    };
    expect(manifest.skills.map((s) => s.name)).not.toContain('dotnet-testing');
  });
});

describe('resolvePackItems', () => {
  it('should derive filesystem names from pack manifest', () => {
    const items = resolvePackItems(FAKE_PACK_MANIFEST);

    const agents = items.filter((i) => i.type === 'agent');
    const skills = items.filter((i) => i.type === 'skill');

    expect(agents).toHaveLength(2);
    expect(agents.map((a) => a.name).sort()).toEqual([
      'gr.csharp-code-reviewer',
      'gr.csharp-coder',
    ]);

    expect(skills).toHaveLength(1);
    expect(skills[0]!.name).toBe('gr.dotnet-feature-workflow');
  });

  it('should handle empty pack manifest', () => {
    const items = resolvePackItems({
      name: 'empty-pack',
      version: '1.0.0',
      agents: [],
      skills: [],
    });

    expect(items).toEqual([]);
  });
});

describe('cleanManifest with namespaced names', () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = makeTmpDir('clean-namespaced');
    mkdirSync(join(projectDir, '.claude'), { recursive: true });
    setupNamespacedManifest(projectDir);
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  it('should remove skill by path when filesystem name differs from manifest name', () => {
    // filesystem name is "gr.dotnet-feature-workflow"
    // manifest name is "grimoire:dotnet-feature-workflow"
    const items: InstallItem[] = [
      { type: 'skill', name: 'gr.dotnet-feature-workflow', sourcePath: '', description: '' },
    ];

    cleanManifest(items, projectDir);

    const manifest = readJson(join(projectDir, '.claude', 'skills-manifest.json')) as {
      skills: Array<{ name: string }>;
    };
    expect(manifest.skills).toHaveLength(0);
  });

  it('should remove skill references from agents when using path-based matching', () => {
    const items: InstallItem[] = [
      { type: 'skill', name: 'gr.dotnet-feature-workflow', sourcePath: '', description: '' },
    ];

    cleanManifest(items, projectDir);

    const manifest = readJson(join(projectDir, '.claude', 'skills-manifest.json')) as {
      agents: Record<string, { always_skills: string[]; compatible_skills: string[] }>;
    };
    expect(manifest.agents['grimoire:csharp-code-reviewer']!.compatible_skills).not.toContain(
      'grimoire:dotnet-feature-workflow',
    );
    expect(manifest.agents['grimoire:csharp-coder']!.always_skills).not.toContain(
      'grimoire:dotnet-feature-workflow',
    );
  });

  it('should remove agent by manifest name when provided via manifestNames', () => {
    const items: InstallItem[] = [
      { type: 'agent', name: 'gr.csharp-code-reviewer', sourcePath: '', description: '' },
    ];

    cleanManifest(items, projectDir, {
      agentNames: ['grimoire:csharp-code-reviewer'],
    });

    const manifest = readJson(join(projectDir, '.claude', 'skills-manifest.json')) as {
      agents: Record<string, unknown>;
    };
    expect(manifest.agents['grimoire:csharp-code-reviewer']).toBeUndefined();
    expect(manifest.agents['grimoire:csharp-coder']).toBeDefined();
  });
});

describe('runRemovePack', () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = makeTmpDir('remove-pack');
    setupNamespacedProject(projectDir);
    setupNamespacedManifest(projectDir);
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  it('should remove all pack items and clean manifest', async () => {
    const summary = await runRemovePack('dotnet-pack', projectDir);

    // All 3 items removed (2 agents + 1 skill)
    const removed = summary.results.filter((r) => r.removed);
    expect(removed).toHaveLength(3);

    // Files gone
    expect(existsSync(join(projectDir, '.claude', 'agents', 'gr.csharp-code-reviewer.md'))).toBe(false);
    expect(existsSync(join(projectDir, '.claude', 'agents', 'gr.csharp-coder.md'))).toBe(false);
    expect(existsSync(join(projectDir, '.claude', 'skills', 'gr.dotnet-feature-workflow'))).toBe(false);

    // Manifest cleaned
    const manifest = readJson(join(projectDir, '.claude', 'skills-manifest.json')) as {
      skills: Array<{ name: string }>;
      agents: Record<string, unknown>;
    };
    expect(manifest.skills).toHaveLength(0);
    expect(Object.keys(manifest.agents)).toHaveLength(0);
  });

  it('should skip items not installed (partial install)', async () => {
    // Remove one agent file to simulate partial install
    rmSync(join(projectDir, '.claude', 'agents', 'gr.csharp-coder.md'));

    const summary = await runRemovePack('dotnet-pack', projectDir);

    // Only 2 items attempted (the installed ones), both removed
    expect(summary.results).toHaveLength(2);
    expect(summary.results.every((r) => r.removed)).toBe(true);

    // The uninstalled item was not attempted
    const names = summary.results.map((r) => r.item.name);
    expect(names).not.toContain('gr.csharp-coder');
    expect(names).toContain('gr.csharp-code-reviewer');
    expect(names).toContain('gr.dotnet-feature-workflow');
  });

  it('should throw for unknown pack name', async () => {
    await expect(
      runRemovePack('nonexistent-pack', projectDir),
    ).rejects.toThrow(/not found/i);
  });
});
