import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadManifest } from '../src/manifest.js';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('loadManifest', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `skill-router-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  const validManifest = {
    version: '1.0.0',
    config: {
      weights: {
        keywords: 1.0,
        file_extensions: 1.5,
        patterns: 2.0,
        file_paths: 2.5,
      },
      activation_threshold: 3.0,
    },
    skills: [
      {
        path: '/skills/test',
        name: 'Test Skill',
        triggers: {
          keywords: ['test'],
        },
      },
    ],
  };

  it('should load valid manifest', () => {
    const manifestPath = join(testDir, 'manifest.json');
    writeFileSync(manifestPath, JSON.stringify(validManifest));

    const manifest = loadManifest(manifestPath);

    expect(manifest.version).toBe('1.0.0');
    expect(manifest.config.activation_threshold).toBe(3.0);
    expect(manifest.skills).toHaveLength(1);
  });

  it('should throw for missing file', () => {
    const manifestPath = join(testDir, 'nonexistent.json');

    expect(() => loadManifest(manifestPath)).toThrow(/not found|ENOENT/i);
  });

  it('should throw for invalid JSON', () => {
    const manifestPath = join(testDir, 'invalid.json');
    writeFileSync(manifestPath, '{ invalid json }');

    expect(() => loadManifest(manifestPath)).toThrow(/parse|JSON/i);
  });

  it('should throw for missing version', () => {
    const manifestPath = join(testDir, 'manifest.json');
    const invalid = { ...validManifest, version: undefined };
    writeFileSync(manifestPath, JSON.stringify(invalid));

    expect(() => loadManifest(manifestPath)).toThrow(/version/i);
  });

  it('should throw for missing config', () => {
    const manifestPath = join(testDir, 'manifest.json');
    const invalid = { version: '1.0.0', skills: [] };
    writeFileSync(manifestPath, JSON.stringify(invalid));

    expect(() => loadManifest(manifestPath)).toThrow(/config/i);
  });

  it('should throw for missing weights', () => {
    const manifestPath = join(testDir, 'manifest.json');
    const invalid = {
      version: '1.0.0',
      config: { activation_threshold: 3.0 },
      skills: [],
    };
    writeFileSync(manifestPath, JSON.stringify(invalid));

    expect(() => loadManifest(manifestPath)).toThrow(/weights/i);
  });

  it('should throw for missing activation_threshold', () => {
    const manifestPath = join(testDir, 'manifest.json');
    const invalid = {
      version: '1.0.0',
      config: {
        weights: validManifest.config.weights,
      },
      skills: [],
    };
    writeFileSync(manifestPath, JSON.stringify(invalid));

    expect(() => loadManifest(manifestPath)).toThrow(/threshold/i);
  });

  it('should apply default log_path when not provided', () => {
    const manifestPath = join(testDir, 'manifest.json');
    writeFileSync(manifestPath, JSON.stringify(validManifest));

    const manifest = loadManifest(manifestPath);

    expect(manifest.config.log_path).toBe('.claude/logs/skill-router.log');
  });

  it('should preserve custom log_path when provided', () => {
    const manifestPath = join(testDir, 'manifest.json');
    const customManifest = {
      ...validManifest,
      config: {
        ...validManifest.config,
        log_path: 'custom/path.log',
      },
    };
    writeFileSync(manifestPath, JSON.stringify(customManifest));

    const manifest = loadManifest(manifestPath);

    expect(manifest.config.log_path).toBe('custom/path.log');
  });

  it('should apply default empty arrays for missing trigger types', () => {
    const manifestPath = join(testDir, 'manifest.json');
    const minimalSkill = {
      ...validManifest,
      skills: [
        {
          path: '/skills/minimal',
          name: 'Minimal Skill',
          triggers: {},
        },
      ],
    };
    writeFileSync(manifestPath, JSON.stringify(minimalSkill));

    const manifest = loadManifest(manifestPath);
    const skill = manifest.skills[0];

    expect(skill?.triggers.keywords).toEqual([]);
    expect(skill?.triggers.file_extensions).toEqual([]);
    expect(skill?.triggers.patterns).toEqual([]);
    expect(skill?.triggers.file_paths).toEqual([]);
  });
});
