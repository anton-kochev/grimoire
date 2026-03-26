import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

export interface GrimoireConfig {
  enforcement?: boolean;
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
