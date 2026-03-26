import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type { GrimoireConfig } from './types.js';

/**
 * Loads `.claude/grimoire.json` from the project directory.
 * Returns an empty config if the file is missing or invalid.
 */
export function loadGrimoireConfig(projectDir: string): GrimoireConfig {
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
