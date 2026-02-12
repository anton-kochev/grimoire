import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Mock resolve to return our fixture pack path
vi.mock('../src/resolve.js', () => ({
  resolvePackDir: vi.fn(),
}));

// Mock prompt module
vi.mock('../src/prompt.js', () => ({
  promptForItems: vi.fn(),
}));

import { runAdd } from '../src/commands/add.js';
import { resolvePackDir } from '../src/resolve.js';
import { promptForItems } from '../src/prompt.js';
import type { InstallItem } from '../src/types.js';

const mockResolvePackDir = vi.mocked(resolvePackDir);
const mockPromptForItems = vi.mocked(promptForItems);

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

    // Set up a minimal pack
    writeFileSync(
      join(packDir, 'grimoire.json'),
      JSON.stringify({
        name: 'test-pack',
        version: '1.0.0',
        agents: [
          { name: 'agent-a', path: 'agents/agent-a.md', description: 'Agent A' },
        ],
        skills: [
          { name: 'skill-b', path: 'skills/skill-b', description: 'Skill B' },
        ],
      }),
    );

    mkdirSync(join(packDir, 'agents'), { recursive: true });
    writeFileSync(join(packDir, 'agents', 'agent-a.md'), '# Agent A');

    mkdirSync(join(packDir, 'skills', 'skill-b'), { recursive: true });
    writeFileSync(join(packDir, 'skills', 'skill-b', 'SKILL.md'), '# Skill B');

    mockResolvePackDir.mockReturnValue(packDir);
  });

  afterEach(() => {
    rmSync(packDir, { recursive: true, force: true });
    rmSync(projectDir, { recursive: true, force: true });
  });

  it('should install all items when no --pick flag', async () => {
    const summary = await runAdd('test-pack', undefined, projectDir);

    expect(summary.results).toHaveLength(2);
    expect(existsSync(join(projectDir, '.claude', 'agents', 'agent-a.md'))).toBe(true);
    expect(existsSync(join(projectDir, '.claude', 'skills', 'skill-b', 'SKILL.md'))).toBe(true);
  });

  it('should install only named item when --pick=<name>', async () => {
    const summary = await runAdd('test-pack', 'agent-a', projectDir);

    expect(summary.results).toHaveLength(1);
    expect(summary.results[0]?.item.name).toBe('agent-a');
    expect(existsSync(join(projectDir, '.claude', 'agents', 'agent-a.md'))).toBe(true);
    expect(existsSync(join(projectDir, '.claude', 'skills', 'skill-b', 'SKILL.md'))).toBe(false);
  });

  it('should throw when --pick=<name> does not match any item', async () => {
    await expect(
      runAdd('test-pack', 'nonexistent', projectDir),
    ).rejects.toThrow(/not found.*nonexistent/i);
  });

  it('should call interactive prompt when bare --pick (empty string)', async () => {
    const selectedItems: InstallItem[] = [
      { type: 'skill', name: 'skill-b', sourcePath: 'skills/skill-b', description: 'Skill B' },
    ];
    mockPromptForItems.mockResolvedValue(selectedItems);

    const summary = await runAdd('test-pack', '', projectDir);

    expect(mockPromptForItems).toHaveBeenCalledTimes(1);
    expect(summary.results).toHaveLength(1);
    expect(summary.results[0]?.item.name).toBe('skill-b');
  });

  it('should configure skill-router when setup=true', async () => {
    // Add triggers to the pack manifest
    rmSync(join(packDir, 'grimoire.json'));
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

    await runAdd('test-pack', undefined, projectDir, /* enableAutoActivation */ true);

    expect(existsSync(join(projectDir, '.claude', 'settings.json'))).toBe(true);
    expect(existsSync(join(projectDir, '.claude', 'skills-manifest.json'))).toBe(true);

    const manifest = JSON.parse(readFileSync(join(projectDir, '.claude', 'skills-manifest.json'), 'utf-8'));
    const skillNames = manifest.skills.map((s: { name: string }) => s.name);
    expect(skillNames).toContain('skill-b');
  });

  it('should not create config files when setup is not passed', async () => {
    await runAdd('test-pack', undefined, projectDir);

    expect(existsSync(join(projectDir, '.claude', 'settings.json'))).toBe(false);
    expect(existsSync(join(projectDir, '.claude', 'skills-manifest.json'))).toBe(false);
  });

  it('should end-to-end: fixture pack -> target dir has correct files', async () => {
    // Use the actual fixture pack
    const fixtureDir = join(
      realpathSync(join(import.meta.dirname, '..')),
      'tests',
      'fixtures',
      'sample-pack',
    );
    mockResolvePackDir.mockReturnValue(fixtureDir);

    const summary = await runAdd('sample-pack', undefined, projectDir);

    expect(summary.packName).toBe('sample-pack');
    expect(summary.packVersion).toBe('1.0.0');
    expect(summary.results).toHaveLength(2);
    expect(existsSync(join(projectDir, '.claude', 'agents', 'sample-agent.md'))).toBe(true);
    expect(existsSync(join(projectDir, '.claude', 'skills', 'sample-skill', 'SKILL.md'))).toBe(true);
    expect(existsSync(join(projectDir, '.claude', 'skills', 'sample-skill', 'reference', 'guide.md'))).toBe(true);
  });
});
