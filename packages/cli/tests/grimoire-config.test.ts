import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  readGrimoireConfig,
  writeGrimoireConfig,
  recordInstalledVersions,
  removeInstalledEntries,
  isNewer,
} from '../src/grimoire-config.js';
import type { InstallItem } from '../src/types.js';

function makeTmpDir(): string {
  const dir = join(tmpdir(), `grimoire-config-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function makeItem(overrides: Partial<InstallItem> & { name: string }): InstallItem {
  return {
    type: 'agent',
    sourcePath: '',
    description: '',
    ...overrides,
  };
}

describe('recordInstalledVersions', () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = makeTmpDir();
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  it('creates grimoire.json when it does not exist', () => {
    const items: InstallItem[] = [
      makeItem({ name: 'grimoire.ts-coder', version: '2.0.0', pack: 'ts-pack' }),
    ];

    recordInstalledVersions(projectDir, items);

    const config = readGrimoireConfig(projectDir);
    expect(config.installed).toEqual({
      'grimoire.ts-coder': { version: '2.0.0', pack: 'ts-pack' },
    });
  });

  it('merges with existing installed entries without clobbering', () => {
    writeGrimoireConfig(projectDir, {
      enforcement: true,
      installed: {
        'grimoire.existing': { version: '1.0.0', pack: 'dev-pack' },
      },
    });

    const items: InstallItem[] = [
      makeItem({ name: 'grimoire.new-agent', version: '1.0.0', pack: 'dotnet-pack' }),
    ];

    recordInstalledVersions(projectDir, items);

    const config = readGrimoireConfig(projectDir);
    expect(config.enforcement).toBe(true);
    expect(config.installed).toEqual({
      'grimoire.existing': { version: '1.0.0', pack: 'dev-pack' },
      'grimoire.new-agent': { version: '1.0.0', pack: 'dotnet-pack' },
    });
  });

  it('updates version for already-installed item', () => {
    writeGrimoireConfig(projectDir, {
      installed: {
        'grimoire.ts-coder': { version: '1.0.0', pack: 'ts-pack' },
      },
    });

    const items: InstallItem[] = [
      makeItem({ name: 'grimoire.ts-coder', version: '2.0.0', pack: 'ts-pack' }),
    ];

    recordInstalledVersions(projectDir, items);

    const config = readGrimoireConfig(projectDir);
    expect(config.installed?.['grimoire.ts-coder']?.version).toBe('2.0.0');
  });

  it('skips items without version or pack', () => {
    const items: InstallItem[] = [
      makeItem({ name: 'grimoire.no-version' }),
      makeItem({ name: 'grimoire.no-pack', version: '1.0.0' }),
    ];

    recordInstalledVersions(projectDir, items);

    const config = readGrimoireConfig(projectDir);
    expect(config.installed).toBeUndefined();
  });

  it('records multiple items at once', () => {
    const items: InstallItem[] = [
      makeItem({ name: 'grimoire.agent-a', version: '1.0.0', pack: 'pack-a' }),
      makeItem({ name: 'grimoire.agent-b', version: '2.0.0', pack: 'pack-b', type: 'skill' }),
    ];

    recordInstalledVersions(projectDir, items);

    const config = readGrimoireConfig(projectDir);
    expect(config.installed).toEqual({
      'grimoire.agent-a': { version: '1.0.0', pack: 'pack-a' },
      'grimoire.agent-b': { version: '2.0.0', pack: 'pack-b' },
    });
  });
});

describe('removeInstalledEntries', () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = makeTmpDir();
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  it('removes specified entries', () => {
    writeGrimoireConfig(projectDir, {
      installed: {
        'grimoire.keep': { version: '1.0.0', pack: 'pack-a' },
        'grimoire.remove-me': { version: '1.0.0', pack: 'pack-b' },
      },
    });

    removeInstalledEntries(projectDir, ['grimoire.remove-me']);

    const config = readGrimoireConfig(projectDir);
    expect(config.installed).toEqual({
      'grimoire.keep': { version: '1.0.0', pack: 'pack-a' },
    });
  });

  it('is a no-op when no installed map exists', () => {
    writeGrimoireConfig(projectDir, { enforcement: true });

    removeInstalledEntries(projectDir, ['grimoire.anything']);

    const config = readGrimoireConfig(projectDir);
    expect(config.enforcement).toBe(true);
    expect(config.installed).toBeUndefined();
  });

  it('is a no-op when grimoire.json does not exist', () => {
    // Should not throw
    removeInstalledEntries(projectDir, ['grimoire.anything']);
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
