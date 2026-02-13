import * as clack from '@clack/prompts';
import type { PackManifest, InstallItem, SelectionResult } from './types.js';

/**
 * Displays an interactive multiselect prompt for the user to pick items from a pack manifest,
 * then asks whether to enable auto-activation.
 *
 * @returns The selected install items and auto-activation preference
 */
export async function promptForItems(manifest: PackManifest): Promise<SelectionResult> {
  clack.intro(`Pick items from ${manifest.name}`);

  const options = buildOptions(manifest);

  const selected = await clack.multiselect({
    message: 'Select items to install (Space to toggle, Enter to confirm):',
    options,
    required: false,
  });

  if (clack.isCancel(selected)) {
    clack.cancel('Installation cancelled.');
    return { items: [], enableAutoActivation: false };
  }

  const items = selected as InstallItem[];

  if (items.length === 0) {
    clack.outro('Nothing selected.');
    return { items: [], enableAutoActivation: false };
  }

  const autoActivate = await clack.confirm({
    message: 'Enable auto-activation? (skill-router hooks for automatic skill matching)',
    initialValue: true,
  });

  if (clack.isCancel(autoActivate)) {
    clack.cancel('Installation cancelled.');
    return { items: [], enableAutoActivation: false };
  }

  clack.outro('Selection complete.');
  return { items, enableAutoActivation: autoActivate };
}

function buildOptions(manifest: PackManifest): Array<{ label: string; value: InstallItem; hint?: string }> {
  const agentOptions = manifest.agents.map((agent) => ({
    label: `[agent] ${agent.name}`,
    value: {
      type: 'agent' as const,
      name: agent.name,
      sourcePath: agent.path,
      description: agent.description,
    },
    hint: agent.description,
  }));

  const skillOptions = manifest.skills.map((skill) => ({
    label: `[skill] ${skill.name}`,
    value: {
      type: 'skill' as const,
      name: skill.name,
      sourcePath: skill.path,
      description: skill.description,
    },
    hint: skill.description,
  }));

  return [...agentOptions, ...skillOptions];
}
