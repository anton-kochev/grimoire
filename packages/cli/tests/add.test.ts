import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Mock resolve to return controlled pack data
vi.mock('../src/resolve.js', () => ({
  loadAllPacks: vi.fn(),
}));

// Mock prompt module
vi.mock('../src/prompt.js', () => ({
  runWizard: vi.fn(),
}));

import { runAdd } from '../src/commands/add.js';
import { loadAllPacks } from '../src/resolve.js';
import { runWizard } from '../src/prompt.js';
import type { PackOption, WizardResult } from '../src/types.js';

const mockLoadAllPacks = vi.mocked(loadAllPacks);
const mockRunWizard = vi.mocked(runWizard);

describe('runAdd', () => {
  let packDir: string;
  let projectDir: string;

  beforeEach(() => {
    vi.clearAllMocks();

    const raw1 = join(tmpdir(), `grimoire-add-pack-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(raw1, { recursive: true });
    packDir = realpathSync(raw1);

    const raw2 = join(tmpdir(), `grimoire-add-project-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(raw2, { recursive: true });
    projectDir = realpathSync(raw2);

    // Set up a minimal pack on disk
    mkdirSync(join(packDir, 'agents'), { recursive: true });
    writeFileSync(join(packDir, 'agents', 'agent-a.md'), '# Agent A');

    mkdirSync(join(packDir, 'skills', 'skill-b'), { recursive: true });
    writeFileSync(join(packDir, 'skills', 'skill-b', 'SKILL.md'), '# Skill B');
  });

  afterEach(() => {
    rmSync(packDir, { recursive: true, force: true });
    rmSync(projectDir, { recursive: true, force: true });
  });

  function makePack(): PackOption {
    return {
      name: 'test-pack',
      dir: packDir,
      manifest: {
        name: 'test-pack',
        version: '1.0.0',
        agents: [
          { name: 'agent-a', path: 'agents/agent-a.md', description: 'Agent A' },
        ],
        skills: [
          { name: 'skill-b', path: 'skills/skill-b', description: 'Skill B' },
        ],
      },
    };
  }

  it('should install all items from a single pack', async () => {
    const pack = makePack();
    mockLoadAllPacks.mockReturnValue([pack]);

    const wizardResult: WizardResult = {
      selections: [
        {
          packDir: pack.dir,
          manifest: pack.manifest,
          items: [
            { type: 'agent', name: 'agent-a', sourcePath: 'agents/agent-a.md', description: 'Agent A' },
            { type: 'skill', name: 'skill-b', sourcePath: 'skills/skill-b', description: 'Skill B' },
          ],
        },
      ],
      enableAutoActivation: false,
    };
    mockRunWizard.mockResolvedValue(wizardResult);

    const summary = await runAdd(projectDir);

    expect(summary.results).toHaveLength(2);
    expect(existsSync(join(projectDir, '.claude', 'agents', 'agent-a.md'))).toBe(true);
    expect(existsSync(join(projectDir, '.claude', 'skills', 'skill-b', 'SKILL.md'))).toBe(true);
  });

  it('should install items from multiple packs', async () => {
    const raw3 = join(tmpdir(), `grimoire-add-pack2-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(raw3, { recursive: true });
    const packDir2 = realpathSync(raw3);

    mkdirSync(join(packDir2, 'skills', 'ts-skill'), { recursive: true });
    writeFileSync(join(packDir2, 'skills', 'ts-skill', 'SKILL.md'), '# TS Skill');

    const pack1 = makePack();
    const pack2: PackOption = {
      name: 'ts-pack',
      dir: packDir2,
      manifest: {
        name: 'ts-pack',
        version: '2.0.0',
        agents: [],
        skills: [
          { name: 'ts-skill', path: 'skills/ts-skill', description: 'TS Skill' },
        ],
      },
    };

    mockLoadAllPacks.mockReturnValue([pack1, pack2]);

    const wizardResult: WizardResult = {
      selections: [
        {
          packDir: pack1.dir,
          manifest: pack1.manifest,
          items: [
            { type: 'agent', name: 'agent-a', sourcePath: 'agents/agent-a.md', description: 'Agent A' },
          ],
        },
        {
          packDir: pack2.dir,
          manifest: pack2.manifest,
          items: [
            { type: 'skill', name: 'ts-skill', sourcePath: 'skills/ts-skill', description: 'TS Skill' },
          ],
        },
      ],
      enableAutoActivation: false,
    };
    mockRunWizard.mockResolvedValue(wizardResult);

    const summary = await runAdd(projectDir);

    expect(summary.results).toHaveLength(2);
    expect(summary.packs).toHaveLength(2);
    expect(summary.packs[0]?.name).toBe('test-pack');
    expect(summary.packs[1]?.name).toBe('ts-pack');
    expect(existsSync(join(projectDir, '.claude', 'agents', 'agent-a.md'))).toBe(true);
    expect(existsSync(join(projectDir, '.claude', 'skills', 'ts-skill', 'SKILL.md'))).toBe(true);

    rmSync(packDir2, { recursive: true, force: true });
  });

  it('should return empty summary when wizard is cancelled', async () => {
    mockLoadAllPacks.mockReturnValue([makePack()]);
    mockRunWizard.mockResolvedValue({ selections: [], enableAutoActivation: false });

    const summary = await runAdd(projectDir);

    expect(summary.packs).toEqual([]);
    expect(summary.results).toEqual([]);
  });

  it('should return empty summary when no packs available', async () => {
    mockLoadAllPacks.mockReturnValue([]);

    const summary = await runAdd(projectDir);

    expect(summary.packs).toEqual([]);
    expect(summary.results).toEqual([]);
    expect(mockRunWizard).not.toHaveBeenCalled();
  });

  it('should configure router when auto-activation enabled', async () => {
    writeFileSync(
      join(packDir, 'grimoire.json'),
      JSON.stringify({
        name: 'test-pack',
        version: '1.0.0',
        agents: [
          { name: 'agent-a', path: 'agents/agent-a.md', description: 'Agent A' },
        ],
        skills: [
          {
            name: 'skill-b',
            path: 'skills/skill-b',
            description: 'Skill B',
            triggers: { keywords: ['test'], file_extensions: [], patterns: [], file_paths: [] },
          },
        ],
      }),
    );

    const pack: PackOption = {
      name: 'test-pack',
      dir: packDir,
      manifest: {
        name: 'test-pack',
        version: '1.0.0',
        agents: [
          { name: 'agent-a', path: 'agents/agent-a.md', description: 'Agent A' },
        ],
        skills: [
          {
            name: 'skill-b',
            path: 'skills/skill-b',
            description: 'Skill B',
            triggers: { keywords: ['test'], file_extensions: [], patterns: [], file_paths: [] },
          },
        ],
      },
    };

    mockLoadAllPacks.mockReturnValue([pack]);

    const wizardResult: WizardResult = {
      selections: [
        {
          packDir: pack.dir,
          manifest: pack.manifest,
          items: [
            { type: 'skill', name: 'skill-b', sourcePath: 'skills/skill-b', description: 'Skill B' },
          ],
        },
      ],
      enableAutoActivation: true,
    };
    mockRunWizard.mockResolvedValue(wizardResult);

    await runAdd(projectDir);

    expect(existsSync(join(projectDir, '.claude', 'settings.json'))).toBe(true);
    expect(existsSync(join(projectDir, '.claude', 'skills-manifest.json'))).toBe(true);
  });

  it('should not create config files when auto-activation is disabled', async () => {
    const pack = makePack();
    mockLoadAllPacks.mockReturnValue([pack]);

    const wizardResult: WizardResult = {
      selections: [
        {
          packDir: pack.dir,
          manifest: pack.manifest,
          items: [
            { type: 'agent', name: 'agent-a', sourcePath: 'agents/agent-a.md', description: 'Agent A' },
          ],
        },
      ],
      enableAutoActivation: false,
    };
    mockRunWizard.mockResolvedValue(wizardResult);

    await runAdd(projectDir);

    expect(existsSync(join(projectDir, '.claude', 'settings.json'))).toBe(false);
    expect(existsSync(join(projectDir, '.claude', 'skills-manifest.json'))).toBe(false);
  });

  it('should end-to-end: fixture pack -> target dir has correct files', async () => {
    const fixtureDir = join(
      realpathSync(join(import.meta.dirname, '..')),
      'tests',
      'fixtures',
      'sample-pack',
    );

    const fixturePack: PackOption = {
      name: 'sample-pack',
      dir: fixtureDir,
      manifest: {
        name: 'sample-pack',
        version: '1.0.0',
        agents: [
          { name: 'sample-agent', path: 'agents/sample-agent.md', description: 'A sample agent' },
        ],
        skills: [
          { name: 'sample-skill', path: 'skills/sample-skill', description: 'A sample skill' },
        ],
      },
    };

    mockLoadAllPacks.mockReturnValue([fixturePack]);

    const wizardResult: WizardResult = {
      selections: [
        {
          packDir: fixtureDir,
          manifest: fixturePack.manifest,
          items: [
            { type: 'agent', name: 'sample-agent', sourcePath: 'agents/sample-agent.md', description: 'A sample agent' },
            { type: 'skill', name: 'sample-skill', sourcePath: 'skills/sample-skill', description: 'A sample skill' },
          ],
        },
      ],
      enableAutoActivation: false,
    };
    mockRunWizard.mockResolvedValue(wizardResult);

    const summary = await runAdd(projectDir);

    expect(summary.packs[0]?.name).toBe('sample-pack');
    expect(summary.packs[0]?.version).toBe('1.0.0');
    expect(summary.results).toHaveLength(2);
    expect(existsSync(join(projectDir, '.claude', 'agents', 'sample-agent.md'))).toBe(true);
    expect(existsSync(join(projectDir, '.claude', 'skills', 'sample-skill', 'SKILL.md'))).toBe(true);
    expect(existsSync(join(projectDir, '.claude', 'skills', 'sample-skill', 'reference', 'guide.md'))).toBe(true);
  });
});
