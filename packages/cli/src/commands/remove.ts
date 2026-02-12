import { scanInstalled, removeItems, cleanManifest } from '../remove.js';
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

function printRemoveSummary(
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
