import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadManifest } from '../src/manifest.js';
import { existsSync, writeFileSync, mkdirSync, rmSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('loadManifest', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `skill-router-test-${Date.now()}`);
    mkdirSync(join(testDir, '.claude'), { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  const validRouter = {
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

  function writeGrimoireJson(router: unknown, extra?: Record<string, unknown>): void {
    writeFileSync(
      join(testDir, '.claude', 'grimoire.json'),
      JSON.stringify({ ...extra, router }),
    );
  }

  it('should load valid manifest from grimoire.json router key', () => {
    writeGrimoireJson(validRouter);

    const manifest = loadManifest(testDir);

    expect(manifest.version).toBe('1.0.0');
    expect(manifest.config.activation_threshold).toBe(3.0);
    expect(manifest.skills).toHaveLength(1);
  });

  it('should throw when grimoire.json is missing', () => {
    expect(() => loadManifest(testDir)).toThrow(/not found|ENOENT/i);
  });

  it('should throw for invalid JSON in grimoire.json', () => {
    writeFileSync(join(testDir, '.claude', 'grimoire.json'), '{ invalid json }');

    expect(() => loadManifest(testDir)).toThrow(/parse|JSON/i);
  });

  it('should throw for missing version in router', () => {
    writeGrimoireJson({ ...validRouter, version: undefined });

    expect(() => loadManifest(testDir)).toThrow(/version/i);
  });

  it('should throw for missing config in router', () => {
    writeGrimoireJson({ version: '1.0.0', skills: [] });

    expect(() => loadManifest(testDir)).toThrow(/config/i);
  });

  it('should throw for missing weights in router', () => {
    writeGrimoireJson({
      version: '1.0.0',
      config: { activation_threshold: 3.0 },
      skills: [],
    });

    expect(() => loadManifest(testDir)).toThrow(/weights/i);
  });

  it('should throw for missing activation_threshold in router', () => {
    writeGrimoireJson({
      version: '1.0.0',
      config: { weights: validRouter.config.weights },
      skills: [],
    });

    expect(() => loadManifest(testDir)).toThrow(/threshold/i);
  });

  it('should apply default log_path when not provided', () => {
    writeGrimoireJson(validRouter);

    const manifest = loadManifest(testDir);

    expect(manifest.config.log_path).toBe('.claude/logs/grimoire-router.log');
  });

  it('should preserve custom log_path when provided', () => {
    writeGrimoireJson({
      ...validRouter,
      config: { ...validRouter.config, log_path: 'custom/path.log' },
    });

    const manifest = loadManifest(testDir);

    expect(manifest.config.log_path).toBe('custom/path.log');
  });

  it('should parse pretooluse_threshold when provided', () => {
    writeGrimoireJson({
      ...validRouter,
      config: { ...validRouter.config, pretooluse_threshold: 1.5 },
    });

    const manifest = loadManifest(testDir);

    expect(manifest.config.pretooluse_threshold).toBe(1.5);
  });

  it('should leave pretooluse_threshold undefined when not provided', () => {
    writeGrimoireJson(validRouter);

    const manifest = loadManifest(testDir);

    expect(manifest.config.pretooluse_threshold).toBeUndefined();
  });

  it('should ignore non-numeric pretooluse_threshold', () => {
    writeGrimoireJson({
      ...validRouter,
      config: { ...validRouter.config, pretooluse_threshold: 'high' },
    });

    const manifest = loadManifest(testDir);

    expect(manifest.config.pretooluse_threshold).toBeUndefined();
  });

  it('should apply default empty arrays for missing trigger types', () => {
    writeGrimoireJson({
      ...validRouter,
      skills: [{ path: '/skills/minimal', name: 'Minimal Skill', triggers: {} }],
    });

    const manifest = loadManifest(testDir);
    const skill = manifest.skills[0];

    expect(skill?.triggers.keywords).toEqual([]);
    expect(skill?.triggers.file_extensions).toEqual([]);
    expect(skill?.triggers.patterns).toEqual([]);
    expect(skill?.triggers.file_paths).toEqual([]);
  });

  it('should parse agents section with file_patterns', () => {
    writeGrimoireJson({
      ...validRouter,
      agents: { 'grimoire.typescript-coder': { file_patterns: ['*.ts', '*.tsx'] } },
    });

    const manifest = loadManifest(testDir);

    expect(manifest.agents).toBeDefined();
    expect(manifest.agents?.['grimoire.typescript-coder']).toEqual({
      file_patterns: ['*.ts', '*.tsx'],
    });
  });

  it('should parse agent entry with only file_patterns', () => {
    writeGrimoireJson({
      ...validRouter,
      agents: { 'grimoire.vue3-coder': { file_patterns: ['*.vue'] } },
    });

    const manifest = loadManifest(testDir);

    expect(manifest.agents?.['grimoire.vue3-coder']).toEqual({ file_patterns: ['*.vue'] });
  });

  it('should parse empty agent entry', () => {
    writeGrimoireJson({
      ...validRouter,
      agents: { 'grimoire.fact-checker': {} },
    });

    const manifest = loadManifest(testDir);

    expect(manifest.agents?.['grimoire.fact-checker']).toEqual({});
  });

  it('should return undefined agents when section is missing', () => {
    writeGrimoireJson(validRouter);

    const manifest = loadManifest(testDir);

    expect(manifest.agents).toBeUndefined();
  });

  it('should throw for non-object agents section', () => {
    writeGrimoireJson({ ...validRouter, agents: ['not', 'an', 'object'] });

    expect(() => loadManifest(testDir)).toThrow(/agents.*object/i);
  });

  it('should throw for non-array file_patterns', () => {
    writeGrimoireJson({
      ...validRouter,
      agents: { 'bad-agent': { file_patterns: 'not-an-array' } },
    });

    expect(() => loadManifest(testDir)).toThrow(/file_patterns.*array/i);
  });

  // Migration tests: old skills-manifest.json → grimoire.json router key
  describe('migration from skills-manifest.json', () => {
    it('should migrate skills-manifest.json into grimoire.json router key', () => {
      // Write old-format skills-manifest.json (no router key in grimoire.json)
      writeFileSync(
        join(testDir, '.claude', 'skills-manifest.json'),
        JSON.stringify(validRouter),
      );
      writeFileSync(
        join(testDir, '.claude', 'grimoire.json'),
        JSON.stringify({ enforcement: true }),
      );

      const manifest = loadManifest(testDir);

      expect(manifest.version).toBe('1.0.0');
      expect(manifest.skills).toHaveLength(1);
    });

    it('should delete skills-manifest.json after migration', () => {
      writeFileSync(
        join(testDir, '.claude', 'skills-manifest.json'),
        JSON.stringify(validRouter),
      );
      writeFileSync(
        join(testDir, '.claude', 'grimoire.json'),
        JSON.stringify({ enforcement: true }),
      );

      loadManifest(testDir);

      expect(existsSync(join(testDir, '.claude', 'skills-manifest.json'))).toBe(false);
    });

    it('should preserve existing grimoire.json keys during migration', () => {
      writeFileSync(
        join(testDir, '.claude', 'skills-manifest.json'),
        JSON.stringify(validRouter),
      );
      writeFileSync(
        join(testDir, '.claude', 'grimoire.json'),
        JSON.stringify({ enforcement: true, installed: { foo: { version: '1.0.0', pack: 'bar' } } }),
      );

      loadManifest(testDir);

      const config = JSON.parse(readFileSync(join(testDir, '.claude', 'grimoire.json'), 'utf-8'));
      expect(config.enforcement).toBe(true);
      expect(config.installed).toEqual({ foo: { version: '1.0.0', pack: 'bar' } });
      expect(config.router).toBeDefined();
    });

    it('should create grimoire.json if only skills-manifest.json exists', () => {
      writeFileSync(
        join(testDir, '.claude', 'skills-manifest.json'),
        JSON.stringify(validRouter),
      );

      const manifest = loadManifest(testDir);

      expect(manifest.version).toBe('1.0.0');
      expect(existsSync(join(testDir, '.claude', 'grimoire.json'))).toBe(true);
      expect(existsSync(join(testDir, '.claude', 'skills-manifest.json'))).toBe(false);
    });

    it('should not migrate when router key already exists', () => {
      // Both files exist, but grimoire.json already has router — use grimoire.json
      writeFileSync(
        join(testDir, '.claude', 'skills-manifest.json'),
        JSON.stringify({ ...validRouter, version: '0.9.0' }),
      );
      writeGrimoireJson(validRouter);

      const manifest = loadManifest(testDir);

      expect(manifest.version).toBe('1.0.0'); // from grimoire.json, not skills-manifest
    });

    it('should throw when neither grimoire.json nor skills-manifest.json exists', () => {
      // .claude dir exists but no config files
      expect(() => loadManifest(testDir)).toThrow(/not found/i);
    });

    it('should throw when grimoire.json has no router key and no skills-manifest.json exists', () => {
      writeFileSync(
        join(testDir, '.claude', 'grimoire.json'),
        JSON.stringify({ enforcement: true }),
      );

      expect(() => loadManifest(testDir)).toThrow(/router/i);
    });
  });
});
