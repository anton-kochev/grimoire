import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Mock the getPacksDir helper to point at our temp directory
let mockPacksDir: string;

vi.mock('url', () => ({
  fileURLToPath: () => join(mockPacksDir, 'fake-src', 'resolve.js'),
}));

import { resolvePackDir, listAvailablePacks, loadAllPacks } from '../src/resolve.js';

describe('resolvePackDir', () => {
  let testDir: string;

  beforeEach(() => {
    const raw = join(tmpdir(), `grimoire-resolve-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(raw, { recursive: true });
    testDir = realpathSync(raw);

    // getPacksDir() resolves to dirname(fileURLToPath(import.meta.url))/../packs
    // With our mock, fileURLToPath returns <testDir>/fake-src/resolve.js
    // so dirname => <testDir>/fake-src, then ../packs => <testDir>/packs
    mockPacksDir = testDir;
    mkdirSync(join(testDir, 'packs'), { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('should resolve a bundled pack by name', () => {
    const packDir = join(testDir, 'packs', 'dotnet-pack');
    mkdirSync(packDir, { recursive: true });
    writeFileSync(join(packDir, 'grimoire.json'), '{}');

    const result = resolvePackDir('dotnet-pack');

    expect(result).toBe(packDir);
  });

  it('should throw with available packs when pack not found', () => {
    // Create some packs so the error message lists them
    mkdirSync(join(testDir, 'packs', 'pack-a'), { recursive: true });
    mkdirSync(join(testDir, 'packs', 'pack-b'), { recursive: true });

    expect(() => resolvePackDir('nonexistent')).toThrow(
      /Pack "nonexistent" not found\. Available packs: pack-a, pack-b/,
    );
  });

  it('should throw with (none) when no packs exist', () => {
    // packs/ dir exists but is empty
    expect(() => resolvePackDir('anything')).toThrow(
      /Available packs: \(none\)/,
    );
  });
});

describe('listAvailablePacks', () => {
  let testDir: string;

  beforeEach(() => {
    const raw = join(tmpdir(), `grimoire-list-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(raw, { recursive: true });
    testDir = realpathSync(raw);
    mockPacksDir = testDir;
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('should list subdirectories of packs/', () => {
    const packsDir = join(testDir, 'packs');
    mkdirSync(join(packsDir, 'alpha'), { recursive: true });
    mkdirSync(join(packsDir, 'beta'), { recursive: true });
    // Regular file should be excluded
    writeFileSync(join(packsDir, 'not-a-pack.txt'), '');

    const result = listAvailablePacks(packsDir);

    expect(result).toEqual(['alpha', 'beta']);
  });

  it('should return empty array when packs dir does not exist', () => {
    const result = listAvailablePacks(join(testDir, 'nonexistent'));

    expect(result).toEqual([]);
  });

  it('should use default packs dir when no argument given', () => {
    mkdirSync(join(testDir, 'packs', 'my-pack'), { recursive: true });

    const result = listAvailablePacks();

    expect(result).toContain('my-pack');
  });
});

describe('loadAllPacks', () => {
  let testDir: string;

  beforeEach(() => {
    const raw = join(tmpdir(), `grimoire-loadall-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(raw, { recursive: true });
    testDir = realpathSync(raw);
    mockPacksDir = testDir;
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('should load all packs with their manifests', () => {
    const packsDir = join(testDir, 'packs');
    const packA = join(packsDir, 'pack-a');
    mkdirSync(packA, { recursive: true });
    writeFileSync(
      join(packA, 'grimoire.json'),
      JSON.stringify({
        name: 'pack-a',
        version: '1.0.0',
        agents: [{ name: 'agent-1', path: 'agents/agent-1.md', description: 'Agent 1' }],
        skills: [],
      }),
    );

    const packB = join(packsDir, 'pack-b');
    mkdirSync(packB, { recursive: true });
    writeFileSync(
      join(packB, 'grimoire.json'),
      JSON.stringify({
        name: 'pack-b',
        version: '2.0.0',
        agents: [],
        skills: [{ name: 'skill-1', path: 'skills/skill-1', description: 'Skill 1' }],
      }),
    );

    const result = loadAllPacks();

    expect(result).toHaveLength(2);
    expect(result[0]?.name).toBe('pack-a');
    expect(result[0]?.manifest.version).toBe('1.0.0');
    expect(result[0]?.manifest.agents).toHaveLength(1);
    expect(result[1]?.name).toBe('pack-b');
    expect(result[1]?.manifest.version).toBe('2.0.0');
    expect(result[1]?.manifest.skills).toHaveLength(1);
  });

  it('should return empty array when no packs exist', () => {
    mkdirSync(join(testDir, 'packs'), { recursive: true });

    const result = loadAllPacks();

    expect(result).toEqual([]);
  });
});
