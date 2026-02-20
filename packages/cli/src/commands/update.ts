import { basename, join } from 'path';
import * as clack from '@clack/prompts';
import { scanInstalled } from '../remove.js';
import { loadAllPacks } from '../resolve.js';
import { copyItems } from '../copy.js';
import { printSummary } from '../summary.js';
import { readFrontmatterVersion, isNewer } from '../version.js';
import type { InstallItem } from '../types.js';

interface UpdateCheckResult {
  readonly item: InstallItem;
  readonly installedVersion: string | undefined;
  readonly availableVersion: string | undefined;
  readonly hasUpdate: boolean;
  readonly packDir: string;
  readonly sourcePath: string;
}

export function checkUpdates(projectDir: string): readonly UpdateCheckResult[] {
  const installed = scanInstalled(projectDir);
  const packs = loadAllPacks();

  // Build lookup: item name -> { entry version, packDir, sourcePath }
  const packLookup = new Map<string, { version: string | undefined; packDir: string; sourcePath: string }>();

  for (const pack of packs) {
    for (const agent of pack.manifest.agents) {
      const name = basename(agent.path, '.md');
      packLookup.set(name, {
        version: agent.version,
        packDir: pack.dir,
        sourcePath: agent.path,
      });
    }
    for (const skill of pack.manifest.skills) {
      const name = basename(skill.path);
      packLookup.set(name, {
        version: skill.version,
        packDir: pack.dir,
        sourcePath: skill.path,
      });
    }
  }

  return installed.map((item) => {
    const match = packLookup.get(item.name);
    if (!match) {
      return {
        item,
        installedVersion: undefined,
        availableVersion: undefined,
        hasUpdate: false,
        packDir: '',
        sourcePath: '',
      };
    }

    const installedFilePath =
      item.type === 'agent'
        ? join(projectDir, '.claude', 'agents', `${item.name}.md`)
        : join(projectDir, '.claude', 'skills', item.name, 'SKILL.md');

    const installedVersion = readFrontmatterVersion(installedFilePath);
    const availableVersion = match.version;
    const hasUpdate = isNewer(availableVersion, installedVersion);

    return {
      item,
      installedVersion,
      availableVersion,
      hasUpdate,
      packDir: match.packDir,
      sourcePath: match.sourcePath,
    };
  });
}

export async function runUpdate(cwd?: string | undefined): Promise<void> {
  const projectDir = cwd ?? process.cwd();

  clack.intro('Grimoire Update');

  const results = checkUpdates(projectDir);
  const outdated = results.filter((r) => r.hasUpdate);

  if (outdated.length === 0) {
    clack.outro('All items are up to date.');
    return;
  }

  const noteLines = outdated.map(
    (r) => `  ${r.item.type} ${r.item.name}: v${r.installedVersion ?? '?'} → v${r.availableVersion ?? '?'}`,
  );
  clack.note(noteLines.join('\n'), 'Updates available');

  const options = outdated.map((r) => ({
    label: `${r.item.name} (${r.item.type})`,
    value: r,
    hint: `v${r.installedVersion ?? '?'} → v${r.availableVersion ?? '?'}`,
  }));

  const selected = await clack.multiselect({
    message: 'Select items to update:',
    options,
    initialValues: outdated,
    required: false,
  });

  if (clack.isCancel(selected)) {
    clack.cancel('Update cancelled.');
    return;
  }

  const chosenResults = selected as UpdateCheckResult[];

  if (chosenResults.length === 0) {
    clack.outro('Nothing selected.');
    return;
  }

  // Group by packDir
  const byPack = new Map<string, { packDir: string; items: InstallItem[] }>();
  for (const r of chosenResults) {
    let group = byPack.get(r.packDir);
    if (!group) {
      group = { packDir: r.packDir, items: [] };
      byPack.set(r.packDir, group);
    }
    group.items.push({ ...r.item, sourcePath: r.sourcePath });
  }

  const allResults = [];
  for (const { packDir, items } of byPack.values()) {
    const copyResults = copyItems(items, packDir, projectDir);
    allResults.push(...copyResults);
  }

  printSummary({ packs: [], results: allResults });
  clack.outro('Update complete.');
}
