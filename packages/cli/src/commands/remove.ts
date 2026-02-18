import { scanInstalled, removeItems, cleanManifest, resolvePackItems } from '../remove.js';
import { loadAllPacks } from '../resolve.js';
import { runRemoveWizard } from '../prompt.js';
import type { RemoveSummary } from '../types.js';

/**
 * Runs the interactive removal wizard: scans all installed items, lets user
 * select what to remove.
 */
export async function runRemoveInteractive(
  cwd?: string | undefined,
): Promise<RemoveSummary> {
  const projectDir = cwd ?? process.cwd();
  const installed = scanInstalled(projectDir);

  if (installed.length === 0) {
    throw new Error('No agents or skills installed in this project');
  }

  // Augment items with pack name (for display) and manifestName (for manifest cleanup)
  const packs = loadAllPacks();
  const packByName = new Map<string, string>();
  const manifestNameByFsName = new Map<string, string>();
  for (const pack of packs) {
    for (const item of resolvePackItems(pack.manifest)) {
      packByName.set(item.name, pack.name);
    }
    for (const agent of pack.manifest.agents) {
      const fsName = agent.path.replace(/^agents\//, '').replace(/\.md$/, '');
      manifestNameByFsName.set(fsName, agent.name);
    }
  }
  const augmented = installed.map((item) => ({
    ...item,
    pack: packByName.get(item.name),
    manifestName: item.type === 'agent' ? manifestNameByFsName.get(item.name) : undefined,
  }));

  const wizard = await runRemoveWizard(augmented);

  if (wizard.items.length === 0) {
    return { results: [] };
  }

  const results = removeItems(wizard.items, projectDir);
  cleanManifest(wizard.items, projectDir);

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
