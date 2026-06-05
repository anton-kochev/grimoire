import * as clack from '@clack/prompts';
import { readGrimoireConfig, isNewer } from './grimoire-config.js';
import type { PackOption, InstallItem, WizardResult, RemoveWizardResult } from './types.js';

const HINT_SEPARATOR = ' — ';

function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function truncate(text: string, maxLength: number): string {
  if (maxLength <= 0 || text.length <= maxLength) return text;
  if (maxLength === 1) return '…';
  return text.slice(0, maxLength - 1).trimEnd() + '…';
}

function itemHint(label: string, description: string, status?: string): string {
  const columns = process.stdout.columns ?? 100;
  const prefix = status ? `${status}${HINT_SEPARATOR}` : '';
  // Clack renders active hints inline as: "│  │ ◼ <label> (<hint>)".
  // Reserve room for prompt chrome, group indentation, icon, spaces, and parens
  // so the active row stays on one terminal line.
  const available = columns - label.length - prefix.length - 16;
  const normalized = oneLine(description);
  const truncated = available > 1 ? truncate(normalized, available) : '';
  return `${prefix}${truncated}`.trimEnd();
}

/**
 * Runs an interactive wizard:
 * 1. Select items to install (grouped by pack, all pre-selected)
 *
 * @returns The wizard result with selected items grouped by pack, or empty on cancel
 */
export async function runWizard(packs: readonly PackOption[], projectDir: string): Promise<WizardResult> {
  const empty: WizardResult = { selections: [] };

  clack.intro('Grimoire Installer');

  // Step 1 — Item selection grouped by pack (all pre-selected)
  const config = readGrimoireConfig(projectDir);
  const groups: Record<string, Array<{ label: string; value: { pack: PackOption; item: InstallItem }; hint?: string }>> = {};
  const allValues: Array<{ pack: PackOption; item: InstallItem }> = [];

  for (const pack of packs) {
    const groupKey = pack.name;
    if (!groups[groupKey]) groups[groupKey] = [];

    for (const agent of pack.manifest.agents) {
      const packVersion = agent.version;
      const label = packVersion
        ? `[agent · v${packVersion}] ${agent.name}`
        : `[agent] ${agent.name}`;

      const installedVersion = config.installed?.[agent.name]?.version;
      const status = installedVersion !== undefined
        ? (!isNewer(packVersion, installedVersion)
            ? `installed: v${installedVersion} (up to date)`
            : `installed: v${installedVersion}`)
        : undefined;
      const hint = itemHint(label, agent.description, status);

      const value = {
        pack,
        item: {
          type: 'agent' as const,
          name: agent.name,
          sourcePath: agent.path,
          description: agent.description,
          pack: pack.name,
          ...(packVersion !== undefined && { version: packVersion }),
        },
      };

      groups[groupKey].push({ label, value, hint });
      allValues.push(value);
    }

    for (const skill of pack.manifest.skills) {
      const packVersion = skill.version;
      const label = packVersion
        ? `[skill · v${packVersion}] ${skill.name}`
        : `[skill] ${skill.name}`;

      const installedVersion = config.installed?.[skill.name]?.version;
      const status = installedVersion !== undefined
        ? (!isNewer(packVersion, installedVersion)
            ? `installed: v${installedVersion} (up to date)`
            : `installed: v${installedVersion}`)
        : undefined;
      const hint = itemHint(label, skill.description, status);

      const value = {
        pack,
        item: {
          type: 'skill' as const,
          name: skill.name,
          sourcePath: skill.path,
          description: skill.description,
          pack: pack.name,
          ...(packVersion !== undefined && { version: packVersion }),
        },
      };

      groups[groupKey].push({ label, value, hint });
      allValues.push(value);
    }
  }

  const selectedItems = await clack.groupMultiselect({
    message: 'Select items to install (Space to toggle, Enter to confirm):',
    options: groups,
    initialValues: allValues,
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

  const groups: Record<string, Array<{ label: string; value: InstallItem; hint: string }>> = {};
  for (const item of installedItems) {
    const group = item.pack ?? 'other';
    if (!groups[group]) groups[group] = [];
    groups[group].push({
      label: `[${item.type}] ${item.name}`,
      value: item,
      hint: item.description,
    });
  }

  const selectedItems = await clack.groupMultiselect({
    message: 'Select items to remove (Space to toggle, Enter to confirm):',
    options: groups,
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
