import { resolvePackDir } from '../resolve.js';
import { loadManifest } from '../manifest.js';
import { copyItems } from '../copy.js';
import { printSummary } from '../summary.js';
import { promptForItems } from '../prompt.js';
import { setupRouter } from '../setup.js';
import type { InstallItem, InstallSummary, PackManifest } from '../types.js';

/**
 * Runs the `add` command: resolves a pack, loads its manifest, determines which items
 * to install, copies them, and prints a summary.
 *
 * @param packageName - npm package name to install from
 * @param pick - undefined = all, "" = interactive, "name" = specific item
 * @param cwd - Target project directory (defaults to process.cwd())
 * @param enableAutoActivation - If true, configure skill-router hooks and manifest
 * @returns The install summary
 */
export async function runAdd(
  packageName: string,
  pick: string | undefined,
  cwd?: string | undefined,
  enableAutoActivation?: boolean,
): Promise<InstallSummary> {
  const projectDir = cwd ?? process.cwd();
  const packDir = resolvePackDir(packageName);
  const manifest = loadManifest(packDir);

  const allItems = manifestToItems(manifest);
  const selectedItems = await selectItems(allItems, manifest, pick);

  const results = copyItems(selectedItems, packDir, projectDir);

  const summary: InstallSummary = {
    packName: manifest.name,
    packVersion: manifest.version,
    results,
  };

  printSummary(summary);

  if (enableAutoActivation) {
    setupRouter(projectDir, manifest);
  }

  return summary;
}

function manifestToItems(manifest: PackManifest): readonly InstallItem[] {
  const agents: InstallItem[] = manifest.agents.map((agent) => ({
    type: 'agent' as const,
    name: agent.name,
    sourcePath: agent.path,
    description: agent.description,
  }));

  const skills: InstallItem[] = manifest.skills.map((skill) => ({
    type: 'skill' as const,
    name: skill.name,
    sourcePath: skill.path,
    description: skill.description,
  }));

  return [...agents, ...skills];
}

async function selectItems(
  allItems: readonly InstallItem[],
  manifest: PackManifest,
  pick: string | undefined,
): Promise<readonly InstallItem[]> {
  // No --pick: install everything
  if (pick === undefined) {
    return allItems;
  }

  // Bare --pick (empty string): interactive prompt
  if (pick === '') {
    return promptForItems(manifest);
  }

  // --pick=<name>: find specific item
  const found = allItems.filter((item) => item.name === pick);
  if (found.length === 0) {
    const available = allItems.map((i) => i.name).join(', ');
    throw new Error(
      `Item not found: "${pick}". Available items: ${available}`,
    );
  }

  return found;
}
