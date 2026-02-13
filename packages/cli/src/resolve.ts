import { existsSync, readdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

/**
 * Resolves the directory path of a bundled pack.
 *
 * @param packName - Pack name (e.g., "dotnet-pack")
 * @returns Absolute path to the pack's root directory
 * @throws Error if the pack is not found
 */
export function resolvePackDir(packName: string): string {
  const packsDir = getPacksDir();
  const packDir = join(packsDir, packName);

  if (!existsSync(packDir)) {
    const available = listAvailablePacks(packsDir);
    const list = available.length > 0 ? available.join(', ') : '(none)';
    throw new Error(
      `Pack "${packName}" not found. Available packs: ${list}`,
    );
  }
  return packDir;
}

/**
 * Lists all available bundled packs.
 *
 * @param packsDir - Optional override for the packs directory path
 * @returns Array of pack names
 */
export function listAvailablePacks(packsDir?: string | undefined): string[] {
  const dir = packsDir ?? getPacksDir();
  if (!existsSync(dir)) return [];

  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

function getPacksDir(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '..', 'packs');
}
