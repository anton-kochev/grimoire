import { scanInstalled, removeItems, cleanManifest, resolvePackItems } from '../remove.js';
import { resolvePackDir } from '../resolve.js';
import { loadManifest } from '../manifest.js';
import type { RemoveSummary } from '../types.js';

/**
 * Runs the `remove` command: scans installed items, selects the target,
 * removes files, and cleans up the manifest.
 *
 * @param itemName - Name of the agent or skill to remove
 * @param pick - undefined = require name, "" = interactive (future)
 * @param cwd - Target project directory (defaults to process.cwd())
 * @returns The remove summary
 */
export async function runRemove(
  itemName: string | undefined,
  pick: string | undefined,
  cwd?: string | undefined,
): Promise<RemoveSummary> {
  const projectDir = cwd ?? process.cwd();
  const installed = scanInstalled(projectDir);

  if (installed.length === 0) {
    throw new Error('No agents or skills installed in this project');
  }

  if (itemName === undefined && pick === undefined) {
    throw new Error('Provide an item name or use --pick for interactive selection');
  }

  // TODO: interactive pick support (pick === '')
  const selected = installed.filter((i) => i.name === itemName);
  if (selected.length === 0) {
    const available = installed.map((i) => i.name).join(', ');
    throw new Error(
      `Item not found: "${itemName}". Available items: ${available}`,
    );
  }

  const results = removeItems(selected, projectDir);
  cleanManifest(selected, projectDir);

  printRemoveSummary(results.filter((r) => r.removed));

  return { results };
}

/**
 * Removes all items from a pack and cleans up the manifest.
 */
export async function runRemovePack(
  packName: string,
  cwd?: string | undefined,
): Promise<RemoveSummary> {
  const projectDir = cwd ?? process.cwd();
  const packDir = resolvePackDir(packName);
  const packManifest = loadManifest(packDir);
  const packItems = resolvePackItems(packManifest);

  // Only remove items that are actually installed
  const installed = scanInstalled(projectDir);
  const installedNames = new Set(installed.map((i) => i.name));
  const toRemove = packItems.filter((i) => installedNames.has(i.name));

  const results = removeItems(toRemove, projectDir);

  // Collect pack manifest names for proper manifest cleanup
  const agentNames = packManifest.agents.map((a) => a.name);
  const skillNames = packManifest.skills.map((s) => s.name);

  cleanManifest(toRemove, projectDir, { agentNames, skillNames });

  printRemoveSummary(results.filter((r) => r.removed));

  return { results };
}

export function printRemoveSummary(
  results: readonly { item: { type: string; name: string }; removed: boolean }[],
): void {
  if (results.length === 0) {
    console.log('Nothing to remove.');
    return;
  }

  console.log('\nRemoved:');
  for (const result of results) {
    console.log(`  ${result.item.type}: ${result.item.name}`);
  }
  console.log(`\n${results.length} item(s) removed.`);
}
