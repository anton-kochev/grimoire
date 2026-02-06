import * as clack from '@clack/prompts';
import type { PackManifest, InstallItem } from './types.js';

/**
 * Displays an interactive multiselect prompt for the user to pick items from a pack manifest.
 *
 * @returns The selected install items, or empty array if cancelled
 */
export async function promptForItems(manifest: PackManifest): Promise<readonly InstallItem[]> {
  clack.intro(`Pick items from ${manifest.name}`);

  const options = buildOptions(manifest);

  const selected = await clack.multiselect({
    message: 'Select items to install:',
    options,
    required: false,
  });

  if (clack.isCancel(selected)) {
    clack.cancel('Installation cancelled.');
    return [];
  }

  clack.outro('Selection complete.');
  return selected as InstallItem[];
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
