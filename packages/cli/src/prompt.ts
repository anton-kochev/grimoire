import { join } from 'path';
import * as clack from '@clack/prompts';
import { readFrontmatterVersion, isNewer } from './version.js';
import type { PackOption, InstallItem, WizardResult, RemoveWizardResult } from './types.js';

/**
 * Runs a 3-step interactive wizard:
 * 1. Select packs to install
 * 2. Select individual items (all pre-selected)
 * 3. Enable auto-activation?
 *
 * @returns The wizard result with selected items grouped by pack, or empty on cancel
 */
export async function runWizard(packs: readonly PackOption[], projectDir: string): Promise<WizardResult> {
  const empty: WizardResult = { selections: [], enableAutoActivation: false };

  clack.intro('Grimoire Installer');

  // Step 1 — Pack selection
  const packOptions = packs.map((pack) => {
    const agentCount = pack.manifest.agents.length;
    const skillCount = pack.manifest.skills.length;
    const parts: string[] = [];
    if (agentCount > 0) parts.push(`${agentCount} agent${agentCount !== 1 ? 's' : ''}`);
    if (skillCount > 0) parts.push(`${skillCount} skill${skillCount !== 1 ? 's' : ''}`);
    return {
      label: pack.name,
      value: pack,
      hint: parts.join(', '),
    };
  });

  const selectedPacks = await clack.multiselect({
    message: 'Select packs to install:',
    options: packOptions,
    required: true,
  });

  if (clack.isCancel(selectedPacks)) {
    clack.cancel('Installation cancelled.');
    return empty;
  }

  const chosenPacks = selectedPacks as PackOption[];

  // Step 2 — Item selection (all pre-selected)
  const itemOptions: Array<{ label: string; value: { pack: PackOption; item: InstallItem }; hint?: string }> = [];

  for (const pack of chosenPacks) {
    for (const agent of pack.manifest.agents) {
      const packVersion = agent.version;
      const label = packVersion
        ? `[${pack.name} · agent · v${packVersion}] ${agent.name}`
        : `[${pack.name} · agent] ${agent.name}`;

      const installedPath = join(projectDir, '.claude', 'agents', `${agent.name}.md`);
      const installedVersion = readFrontmatterVersion(installedPath);
      let hint: string;
      if (installedVersion !== undefined) {
        const upToDate = !isNewer(packVersion, installedVersion);
        hint = upToDate
          ? `installed: v${installedVersion} (up to date) · ${agent.description}`
          : `installed: v${installedVersion} · ${agent.description}`;
      } else {
        hint = agent.description;
      }

      itemOptions.push({
        label,
        value: {
          pack,
          item: {
            type: 'agent' as const,
            name: agent.name,
            sourcePath: agent.path,
            description: agent.description,
            ...(packVersion !== undefined && { version: packVersion }),
          },
        },
        hint,
      });
    }

    for (const skill of pack.manifest.skills) {
      const packVersion = skill.version;
      const label = packVersion
        ? `[${pack.name} · skill · v${packVersion}] ${skill.name}`
        : `[${pack.name} · skill] ${skill.name}`;

      const installedPath = join(projectDir, '.claude', 'skills', skill.name, 'SKILL.md');
      const installedVersion = readFrontmatterVersion(installedPath);
      let hint: string;
      if (installedVersion !== undefined) {
        const upToDate = !isNewer(packVersion, installedVersion);
        hint = upToDate
          ? `installed: v${installedVersion} (up to date) · ${skill.description}`
          : `installed: v${installedVersion} · ${skill.description}`;
      } else {
        hint = skill.description;
      }

      itemOptions.push({
        label,
        value: {
          pack,
          item: {
            type: 'skill' as const,
            name: skill.name,
            sourcePath: skill.path,
            description: skill.description,
            ...(packVersion !== undefined && { version: packVersion }),
          },
        },
        hint,
      });
    }
  }

  const selectedItems = await clack.multiselect({
    message: 'Select items to install (Space to toggle, Enter to confirm):',
    options: itemOptions,
    initialValues: itemOptions.map((o) => o.value),
    required: false,
  });

  if (clack.isCancel(selectedItems)) {
    clack.cancel('Installation cancelled.');
    return empty;
  }

  const chosenItems = selectedItems as Array<{ pack: PackOption; item: InstallItem }>;

  if (chosenItems.length === 0) {
    clack.outro('Nothing selected.');
    return empty;
  }

  // Step 3 — Auto-activation
  const autoActivate = await clack.confirm({
    message: 'Enable auto-activation? (skill-router hooks for automatic skill matching)',
    initialValue: true,
  });

  if (clack.isCancel(autoActivate)) {
    clack.cancel('Installation cancelled.');
    return empty;
  }

  clack.outro('Selection complete.');

  // Group items by pack
  const groupMap = new Map<string, { packDir: string; manifest: PackOption['manifest']; items: InstallItem[] }>();

  for (const { pack, item } of chosenItems) {
    let group = groupMap.get(pack.name);
    if (!group) {
      group = { packDir: pack.dir, manifest: pack.manifest, items: [] };
      groupMap.set(pack.name, group);
    }
    group.items.push(item);
  }

  return {
    selections: [...groupMap.values()],
    enableAutoActivation: autoActivate,
  };
}

/**
 * Runs an interactive removal wizard:
 * 1. Shows all installed items in a multiselect (unchecked by default)
 * 2. Confirms removal
 *
 * @returns The wizard result with selected items, or empty on cancel
 */
export async function runRemoveWizard(
  installedItems: readonly InstallItem[],
): Promise<RemoveWizardResult> {
  const empty: RemoveWizardResult = { items: [] };

  clack.intro('Grimoire Remover');

  const itemOptions = installedItems.map((item) => ({
    label: item.pack ? `[${item.pack} | ${item.type}] ${item.name}` : `[${item.type}] ${item.name}`,
    value: item,
    hint: item.description,
  }));

  const selectedItems = await clack.multiselect({
    message: 'Select items to remove (Space to toggle, Enter to confirm):',
    options: itemOptions,
    initialValues: [],
    required: false,
  });

  if (clack.isCancel(selectedItems)) {
    clack.cancel('Removal cancelled.');
    return empty;
  }

  const chosenItems = selectedItems as InstallItem[];

  if (chosenItems.length === 0) {
    clack.outro('Nothing selected.');
    return empty;
  }

  const confirm = await clack.confirm({
    message: `Remove ${chosenItems.length} item(s)?`,
    initialValue: false,
  });

  if (clack.isCancel(confirm) || !confirm) {
    clack.cancel('Removal cancelled.');
    return empty;
  }

  clack.outro('Selection complete.');

  return { items: chosenItems };
}
