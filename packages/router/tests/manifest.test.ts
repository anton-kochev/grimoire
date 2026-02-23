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

    expect(manifest.config.log_path).toBe('.claude/logs/grimoire-router.log');
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

  it('should parse pretooluse_threshold when provided', () => {
    const manifestPath = join(testDir, 'manifest.json');
    const withThreshold = {
      ...validManifest,
      config: { ...validManifest.config, pretooluse_threshold: 1.5 },
    };
    writeFileSync(manifestPath, JSON.stringify(withThreshold));

    const manifest = loadManifest(manifestPath);

    expect(manifest.config.pretooluse_threshold).toBe(1.5);
  });

  it('should leave pretooluse_threshold undefined when not provided', () => {
    const manifestPath = join(testDir, 'manifest.json');
    writeFileSync(manifestPath, JSON.stringify(validManifest));

    const manifest = loadManifest(manifestPath);

    expect(manifest.config.pretooluse_threshold).toBeUndefined();
  });

  it('should ignore non-numeric pretooluse_threshold', () => {
    const manifestPath = join(testDir, 'manifest.json');
    const invalid = {
      ...validManifest,
      config: { ...validManifest.config, pretooluse_threshold: 'high' },
    };
    writeFileSync(manifestPath, JSON.stringify(invalid));

    const manifest = loadManifest(manifestPath);

    expect(manifest.config.pretooluse_threshold).toBeUndefined();
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

  it('should parse agents section with file_patterns and enforce', () => {
    const manifestPath = join(testDir, 'manifest.json');
    const withAgents = {
      ...validManifest,
      agents: {
        'grimoire.typescript-coder': {
          file_patterns: ['*.ts', '*.tsx'],
          enforce: true,
        },
      },
    };
    writeFileSync(manifestPath, JSON.stringify(withAgents));

    const manifest = loadManifest(manifestPath);

    expect(manifest.agents).toBeDefined();
    expect(manifest.agents?.['grimoire.typescript-coder']).toEqual({
      file_patterns: ['*.ts', '*.tsx'],
      enforce: true,
    });
  });

  it('should parse agent entry with only file_patterns (no enforce)', () => {
    const manifestPath = join(testDir, 'manifest.json');
    const withAgents = {
      ...validManifest,
      agents: { 'grimoire.vue3-coder': { file_patterns: ['*.vue'] } },
    };
    writeFileSync(manifestPath, JSON.stringify(withAgents));

    const manifest = loadManifest(manifestPath);

    expect(manifest.agents?.['grimoire.vue3-coder']).toEqual({ file_patterns: ['*.vue'] });
  });

  it('should parse empty agent entry (no file_patterns, no enforce)', () => {
    const manifestPath = join(testDir, 'manifest.json');
    const withAgents = {
      ...validManifest,
      agents: { 'grimoire.fact-checker': {} },
    };
    writeFileSync(manifestPath, JSON.stringify(withAgents));

    const manifest = loadManifest(manifestPath);

    expect(manifest.agents?.['grimoire.fact-checker']).toEqual({});
  });

  it('should return undefined agents when section is missing', () => {
    const manifestPath = join(testDir, 'manifest.json');
    writeFileSync(manifestPath, JSON.stringify(validManifest));

    const manifest = loadManifest(manifestPath);

    expect(manifest.agents).toBeUndefined();
  });

  it('should throw for non-object agents section', () => {
    const manifestPath = join(testDir, 'manifest.json');
    const invalid = { ...validManifest, agents: ['not', 'an', 'object'] };
    writeFileSync(manifestPath, JSON.stringify(invalid));

    expect(() => loadManifest(manifestPath)).toThrow(/agents.*object/i);
  });

  it('should throw for non-array file_patterns', () => {
    const manifestPath = join(testDir, 'manifest.json');
    const invalid = {
      ...validManifest,
      agents: { 'bad-agent': { file_patterns: 'not-an-array' } },
    };
    writeFileSync(manifestPath, JSON.stringify(invalid));

    expect(() => loadManifest(manifestPath)).toThrow(/file_patterns.*array/i);
  });

  it('should throw for non-boolean enforce', () => {
    const manifestPath = join(testDir, 'manifest.json');
    const invalid = {
      ...validManifest,
      agents: { 'bad-agent': { enforce: 'yes' } },
    };
    writeFileSync(manifestPath, JSON.stringify(invalid));

    expect(() => loadManifest(manifestPath)).toThrow(/enforce.*boolean/i);
  });
});
