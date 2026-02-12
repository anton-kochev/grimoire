import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadManifest } from '../src/manifest.js';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('loadManifest', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `grimoire-cli-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  const validManifest = {
    name: 'test-pack',
    version: '1.0.0',
    agents: [
      {
        name: 'test-agent',
        path: 'agents/test-agent.md',
        description: 'A test agent',
      },
    ],
    skills: [
      {
        name: 'test-skill',
        path: 'skills/test-skill',
        description: 'A test skill',
        triggers: {
          keywords: ['test'],
          file_extensions: ['.ts'],
          patterns: ['test.*'],
          file_paths: ['src/test/'],
        },
      },
    ],
  };

  it('should load valid manifest with agents and skills', () => {
    const manifestPath = join(testDir, 'grimoire.json');
    writeFileSync(manifestPath, JSON.stringify(validManifest));

    const manifest = loadManifest(testDir);

    expect(manifest.name).toBe('test-pack');
    expect(manifest.version).toBe('1.0.0');
    expect(manifest.agents).toHaveLength(1);
    expect(manifest.agents[0]?.name).toBe('test-agent');
    expect(manifest.skills).toHaveLength(1);
    expect(manifest.skills[0]?.name).toBe('test-skill');
  });

  it('should load manifest with empty agents and skills arrays', () => {
    const manifestPath = join(testDir, 'grimoire.json');
    const emptyManifest = { ...validManifest, agents: [], skills: [] };
    writeFileSync(manifestPath, JSON.stringify(emptyManifest));

    const manifest = loadManifest(testDir);

    expect(manifest.agents).toEqual([]);
    expect(manifest.skills).toEqual([]);
  });

  it('should load manifest with skill triggers', () => {
    const manifestPath = join(testDir, 'grimoire.json');
    writeFileSync(manifestPath, JSON.stringify(validManifest));

    const manifest = loadManifest(testDir);
    const skill = manifest.skills[0];

    expect(skill?.triggers?.keywords).toEqual(['test']);
    expect(skill?.triggers?.file_extensions).toEqual(['.ts']);
    expect(skill?.triggers?.patterns).toEqual(['test.*']);
    expect(skill?.triggers?.file_paths).toEqual(['src/test/']);
  });

  it('should throw on missing grimoire.json file', () => {
    expect(() => loadManifest(testDir)).toThrow(/not found|ENOENT/i);
  });

  it('should throw on invalid JSON', () => {
    const manifestPath = join(testDir, 'grimoire.json');
    writeFileSync(manifestPath, '{ invalid json }');

    expect(() => loadManifest(testDir)).toThrow(/parse|JSON/i);
  });

  it('should throw on missing name field', () => {
    const manifestPath = join(testDir, 'grimoire.json');
    const { name: _, ...noName } = validManifest;
    writeFileSync(manifestPath, JSON.stringify(noName));

    expect(() => loadManifest(testDir)).toThrow(/name/i);
  });

  it('should throw on missing version field', () => {
    const manifestPath = join(testDir, 'grimoire.json');
    const { version: _, ...noVersion } = validManifest;
    writeFileSync(manifestPath, JSON.stringify(noVersion));

    expect(() => loadManifest(testDir)).toThrow(/version/i);
  });

  it('should throw on missing agents field', () => {
    const manifestPath = join(testDir, 'grimoire.json');
    const { agents: _, ...noAgents } = validManifest;
    writeFileSync(manifestPath, JSON.stringify(noAgents));

    expect(() => loadManifest(testDir)).toThrow(/agents/i);
  });

  it('should throw on missing skills field', () => {
    const manifestPath = join(testDir, 'grimoire.json');
    const { skills: _, ...noSkills } = validManifest;
    writeFileSync(manifestPath, JSON.stringify(noSkills));

    expect(() => loadManifest(testDir)).toThrow(/skills/i);
  });

  it('should throw on agent entry missing required fields', () => {
    const manifestPath = join(testDir, 'grimoire.json');
    const badAgent = {
      ...validManifest,
      agents: [{ name: 'missing-path' }],
    };
    writeFileSync(manifestPath, JSON.stringify(badAgent));

    expect(() => loadManifest(testDir)).toThrow(/agent.*path|agent.*description/i);
  });

  it('should throw on skill entry missing required fields', () => {
    const manifestPath = join(testDir, 'grimoire.json');
    const badSkill = {
      ...validManifest,
      skills: [{ name: 'missing-path' }],
    };
    writeFileSync(manifestPath, JSON.stringify(badSkill));

    expect(() => loadManifest(testDir)).toThrow(/skill.*path|skill.*description/i);
  });

  it('should accept skills without triggers (optional)', () => {
    const manifestPath = join(testDir, 'grimoire.json');
    const noTriggers = {
      ...validManifest,
      skills: [
        {
          name: 'no-triggers-skill',
          path: 'skills/no-triggers',
          description: 'Skill without triggers',
        },
      ],
    };
    writeFileSync(manifestPath, JSON.stringify(noTriggers));

    const manifest = loadManifest(testDir);

    expect(manifest.skills[0]?.triggers).toBeUndefined();
  });
});
