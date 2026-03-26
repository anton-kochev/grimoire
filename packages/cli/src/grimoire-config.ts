import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { InstallItem } from './types.js';

export interface InstalledEntry {
  version: string;
  pack: string;
}

export interface GrimoireConfig {
  enforcement?: boolean;
  installed?: Record<string, InstalledEntry>;
}

export function readGrimoireConfig(projectDir: string): GrimoireConfig {
  const configPath = join(projectDir, '.claude', 'grimoire.json');
  if (!existsSync(configPath)) return {};

  try {
    const data = JSON.parse(readFileSync(configPath, 'utf-8')) as unknown;
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      return data as GrimoireConfig;
    }
  } catch {
    // Ignore parse errors — treat as empty
  }
  return {};
}

export function writeGrimoireConfig(projectDir: string, config: GrimoireConfig): void {
  const claudeDir = join(projectDir, '.claude');
  mkdirSync(claudeDir, { recursive: true });
  writeFileSync(join(claudeDir, 'grimoire.json'), JSON.stringify(config, null, 2) + '\n');
}

export function recordInstalledVersions(
  projectDir: string,
  items: readonly InstallItem[],
): void {
  const entries: Array<{ name: string; version: string; pack: string }> = [];
  for (const item of items) {
    if (item.version && item.pack) {
      entries.push({ name: item.name, version: item.version, pack: item.pack });
    }
  }
  if (entries.length === 0) return;

  const config = readGrimoireConfig(projectDir);
  const installed = config.installed ?? {};
  for (const entry of entries) {
    installed[entry.name] = { version: entry.version, pack: entry.pack };
  }
  writeGrimoireConfig(projectDir, { ...config, installed });
}

export function removeInstalledEntries(
  projectDir: string,
  names: readonly string[],
): void {
  const config = readGrimoireConfig(projectDir);
  if (!config.installed) return;

  for (const name of names) {
    delete config.installed[name];
  }
  writeGrimoireConfig(projectDir, config);
}

/** Returns true if `available` semver is strictly newer than `installed`. */
export function isNewer(available: string | undefined, installed: string | undefined): boolean {
  if (!available || !installed) return false;
  const parse = (v: string) => v.split('.').map((n) => parseInt(n, 10));
  const [a, b] = [parse(available), parse(installed)];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff > 0) return true;
    if (diff < 0) return false;
  }
  return false;
}
