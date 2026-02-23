/**
 * `grimoire enforce-agent` — interactive toggle for per-agent enforcement.
 */

import { existsSync, readdirSync } from 'fs';
import { join, basename } from 'path';
import * as clack from '@clack/prompts';
import {
  readManifest,
  writeManifest,
  setEnforce,
  readAgentMeta,
  ensureEnforceHooks,
  removeEnforceHooks,
} from '../enforce.js';

export async function runEnforceAgent(projectDir: string): Promise<void> {
  // Load manifest
  let manifest;
  try {
    manifest = readManifest(projectDir);
  } catch {
    clack.log.error('No skills-manifest.json found. Run `grimoire add` first.');
    process.exit(1);
  }

  // Scan installed agents
  const agentsDir = join(projectDir, '.claude', 'agents');
  if (!existsSync(agentsDir)) {
    clack.log.error('No agents installed. Run `grimoire add` first.');
    process.exit(1);
  }

  // Build list of agents that have file_patterns in the manifest
  const agentFiles = readdirSync(agentsDir).filter((f) => f.endsWith('.md'));

  const enforceable: Array<{
    name: string;
    manifestName: string;
    description: string;
    currentlyEnforced: boolean;
  }> = [];

  for (const file of agentFiles) {
    const agentPath = join(agentsDir, file);
    const fsName = basename(file, '.md');

    // Look up manifest entry by filesystem name or manifest name
    const manifestEntry =
      manifest.agents[fsName] ??
      Object.entries(manifest.agents).find(([key]) =>
        key.endsWith(`.${fsName}`) || key === fsName,
      )?.[1];

    const manifestName =
      Object.keys(manifest.agents).find(
        (key) => key === fsName || key.endsWith(`.${fsName}`),
      ) ?? fsName;

    if (!manifestEntry?.file_patterns?.length) continue;

    const meta = readAgentMeta(agentPath);
    enforceable.push({
      name: fsName,
      manifestName,
      description: meta.description || manifestName,
      currentlyEnforced: manifestEntry.enforce === true,
    });
  }

  if (enforceable.length === 0) {
    console.log(
      'No enforceable agents found. Install a pack with file_patterns to enable enforcement.',
    );
    return;
  }

  clack.intro('Agent Enforcement');

  const options = enforceable.map((a) => ({
    value: a.manifestName,
    label: a.manifestName,
    hint: a.description.length > 80 ? a.description.slice(0, 80) + '…' : a.description,
  }));

  const initialValues = enforceable
    .filter((a) => a.currentlyEnforced)
    .map((a) => a.manifestName);

  const selected = await clack.multiselect<string>({
    message: 'Select agents Claude must delegate to:',
    options,
    initialValues,
    required: false,
  });

  if (clack.isCancel(selected)) {
    clack.cancel('Cancelled.');
    return;
  }

  const enabledNames = selected as string[];
  const enabledSet = new Set(enabledNames);

  // Apply enforce flags
  for (const agent of enforceable) {
    try {
      setEnforce(manifest, agent.manifestName, enabledSet.has(agent.manifestName));
    } catch (err) {
      clack.log.warn(
        `Could not set enforcement for ${agent.manifestName}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  writeManifest(projectDir, manifest);

  // Update hooks
  if (enabledNames.length > 0) {
    ensureEnforceHooks(projectDir, enabledNames);
  } else {
    removeEnforceHooks(projectDir);
  }

  const count = enabledNames.length;
  if (count > 0) {
    clack.outro(`Agent enforcement updated. ${count} agent(s) enforced.`);
  } else {
    clack.outro('Agent enforcement disabled.');
  }
}
