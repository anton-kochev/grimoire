import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { readFrontmatterVersion, isNewer } from '../src/version.js';

describe('readFrontmatterVersion', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `grimoire-version-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('reads version from agent frontmatter', () => {
    const file = join(testDir, 'agent.md');
    writeFileSync(file, '---\nname: test-agent\ndescription: Test\nversion: 1.2.3\n---\n\n# Body');
    expect(readFrontmatterVersion(file)).toBe('1.2.3');
  });

  it('reads version from skill frontmatter', () => {
    const file = join(testDir, 'SKILL.md');
    writeFileSync(file, '---\nname: test-skill\ndescription: Test\nversion: 2.0.0\n---\n\n# Body');
    expect(readFrontmatterVersion(file)).toBe('2.0.0');
  });

  it('returns undefined when no frontmatter', () => {
    const file = join(testDir, 'no-fm.md');
    writeFileSync(file, '# Just a heading\n\nNo frontmatter here.');
    expect(readFrontmatterVersion(file)).toBeUndefined();
  });

  it('returns undefined when version field is absent', () => {
    const file = join(testDir, 'no-version.md');
    writeFileSync(file, '---\nname: test\ndescription: Test\n---\n\n# Body');
    expect(readFrontmatterVersion(file)).toBeUndefined();
  });

  it('returns undefined for nonexistent file', () => {
    const file = join(testDir, 'does-not-exist.md');
    expect(readFrontmatterVersion(file)).toBeUndefined();
  });

  it('trims whitespace from version value', () => {
    const file = join(testDir, 'whitespace.md');
    writeFileSync(file, '---\nname: test\nversion:   1.0.0   \n---\n\n# Body');
    expect(readFrontmatterVersion(file)).toBe('1.0.0');
  });
});

describe('isNewer', () => {
  it('returns true when patch version is higher', () => {
    expect(isNewer('1.0.1', '1.0.0')).toBe(true);
  });

  it('returns true when minor version is higher', () => {
    expect(isNewer('1.1.0', '1.0.0')).toBe(true);
  });

  it('returns true when major version is higher', () => {
    expect(isNewer('2.0.0', '1.9.9')).toBe(true);
  });

  it('returns false when versions are equal', () => {
    expect(isNewer('1.0.0', '1.0.0')).toBe(false);
  });

  it('returns false when available is older', () => {
    expect(isNewer('1.0.0', '1.0.1')).toBe(false);
  });

  it('returns false when available is undefined', () => {
    expect(isNewer(undefined, '1.0.0')).toBe(false);
  });

  it('returns false when installed is undefined', () => {
    expect(isNewer('1.0.0', undefined)).toBe(false);
  });

  it('returns false when both are undefined', () => {
    expect(isNewer(undefined, undefined)).toBe(false);
  });
});
