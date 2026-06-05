import { loadAllPacks } from '../resolve.js';
import { copyItems } from '../copy.js';
import { printSummary } from '../summary.js';
import { recordInstalledVersions } from '../grimoire-config.js';
import { runWizard } from '../prompt.js';
import { setupRouter } from '../setup.js';
import type { InstallResult, InstallSummary } from '../types.js';

/**
 * Runs the `add` command as an interactive wizard: loads all available packs,
 * prompts the user through pack/item selection, copies items, and prints a summary.
 *
 * @param cwd - Target project directory (defaults to process.cwd())
 * @returns The install summary
 */
export async function runAdd(cwd?: string | undefined): Promise<InstallSummary> {
  const projectDir = cwd ?? process.cwd();
  const packs = loadAllPacks();

  if (packs.length === 0) {
    console.log('No packs available.');
    return { packs: [], results: [] };
  }

  const wizard = await runWizard(packs, projectDir);

  if (wizard.selections.length === 0) {
    return { packs: [], results: [] };
  }

  const allResults: InstallResult[] = [];
  const packInfo: Array<{ name: string; version: string }> = [];

  for (const selection of wizard.selections) {
    const results = copyItems(selection.items, selection.packDir, projectDir);
    allResults.push(...results);
    recordInstalledVersions(projectDir, selection.items);
    packInfo.push({
      name: selection.manifest.name,
      version: selection.manifest.version,
    });

    // Always register items and non-matching router metadata so list/remove/update,
    // enforcement, and explicit subagent skill injection can find them.
    setupRouter(projectDir, selection.manifest, { quiet: true });
  }

  const summary: InstallSummary = {
    packs: packInfo,
    results: allResults,
  };

  printSummary(summary);

  return summary;
}
