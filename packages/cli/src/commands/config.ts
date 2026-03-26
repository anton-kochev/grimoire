/**
 * `grimoire config` — interactive menu for global Grimoire settings.
 */

import * as clack from '@clack/prompts';
import { readGrimoireConfig, writeGrimoireConfig } from '../grimoire-config.js';
import { readManifest, ensureEnforceHooks, removeEnforceHooks } from '../enforce.js';

export async function runConfig(projectDir: string, options?: { quiet?: boolean }): Promise<void> {
  if (!options?.quiet) clack.intro('Grimoire configuration');

  const config = readGrimoireConfig(projectDir);

  // Collect agents with file_patterns for enforcement info
  let agentsWithPatterns: string[] = [];
  try {
    const manifest = readManifest(projectDir);
    agentsWithPatterns = Object.entries(manifest.agents)
      .filter(([, entry]) => entry.file_patterns && entry.file_patterns.length > 0)
      .map(([name]) => name);
  } catch {
    // No manifest — enforcement won't list any agents
  }

  const enforcementHint = agentsWithPatterns.length > 0
    ? `${agentsWithPatterns.length} agent(s) with file patterns`
    : 'no agents with file patterns';

  const selected = await clack.multiselect({
    message: 'Toggle features',
    options: [
      {
        value: 'enforcement' as const,
        label: 'Agent enforcement',
        hint: enforcementHint,
      },
    ],
    initialValues: config.enforcement ? ['enforcement' as const] : [],
    required: false,
  });

  if (clack.isCancel(selected)) {
    if (!options?.quiet) clack.outro('Cancelled.');
    return;
  }

  const enforcementEnabled = (selected as string[]).includes('enforcement');
  const changed = enforcementEnabled !== (config.enforcement ?? false);

  if (!changed) {
    if (!options?.quiet) clack.outro('No changes.');
    return;
  }

  config.enforcement = enforcementEnabled;
  writeGrimoireConfig(projectDir, config);

  if (enforcementEnabled) {
    ensureEnforceHooks(projectDir, agentsWithPatterns);
    clack.log.success('Enforcement enabled.');
  } else {
    removeEnforceHooks(projectDir);
    clack.log.success('Enforcement disabled.');
  }

  if (!options?.quiet) clack.outro('Configuration saved.');
}
