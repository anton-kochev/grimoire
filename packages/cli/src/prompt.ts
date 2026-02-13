import * as clack from '@clack/prompts';
import type { PackOption, InstallItem, WizardResult } from './types.js';

/**
 * Runs a 3-step interactive wizard:
 * 1. Select packs to install
 * 2. Select individual items (all pre-selected)
 * 3. Enable auto-activation?
 *
 * @returns The wizard result with selected items grouped by pack, or empty on cancel
 */
export async function runWizard(packs: readonly PackOption[]): Promise<WizardResult> {
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
      itemOptions.push({
        label: `[${pack.name} | agent] ${agent.name}`,
        value: {
          pack,
          item: {
            type: 'agent' as const,
            name: agent.name,
            sourcePath: agent.path,
            description: agent.description,
          },
        },
        hint: agent.description,
      });
    }

    for (const skill of pack.manifest.skills) {
      itemOptions.push({
        label: `[${pack.name} | skill] ${skill.name}`,
        value: {
          pack,
          item: {
            type: 'skill' as const,
            name: skill.name,
            sourcePath: skill.path,
            description: skill.description,
          },
        },
        hint: skill.description,
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
