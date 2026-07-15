/**
 * `grimoire config` — interactive menu for global Grimoire settings.
 */

import * as clack from '@clack/prompts';
import { readGrimoireConfig, writeGrimoireConfig } from '../grimoire-config.js';
import {
  readManifest,
  ensureEnforceHooks,
  ensureSubagentHooks,
  removeEnforceHooks,
  agentsWithPatterns,
  agentsWithApproaches,
} from '../enforce.js';

/** Mirrors the router's default (packages/router/src/archive.ts). */
const DEFAULT_RETAIN_RUNS_PER_AGENT = 20;

export async function runConfig(projectDir: string, options?: { quiet?: boolean }): Promise<void> {
  if (!options?.quiet) clack.intro('Grimoire configuration');

  const config = readGrimoireConfig(projectDir);

  // Collect agents with file_patterns (enforcement) and approaches (hook survival)
  let patternAgents: string[] = [];
  let approachAgents: string[] = [];
  try {
    const manifest = readManifest(projectDir);
    patternAgents = agentsWithPatterns(manifest);
    approachAgents = agentsWithApproaches(manifest);
  } catch {
    // No manifest — enforcement won't list any agents
  }

  const enforcementHint = patternAgents.length > 0
    ? `${patternAgents.length} agent(s) with file patterns`
    : 'no agents with file patterns';

  // Archiving is on unless explicitly disabled — pre-select it accordingly.
  const archivingOn = config.insights?.archive !== false;

  const initialValues: string[] = [];
  if (config.enforcement) initialValues.push('enforcement');
  if (config.verboseEnforcementLog) initialValues.push('verboseLog');
  if (archivingOn) initialValues.push('archive');

  const selected = await clack.multiselect({
    message: 'Toggle features',
    options: [
      {
        value: 'enforcement' as const,
        label: 'Agent enforcement',
        hint: enforcementHint,
      },
      {
        value: 'verboseLog' as const,
        label: 'Verbose enforcement log',
        hint: 'logs allowed edits to non-owned files — for tuning file patterns',
      },
      {
        value: 'archive' as const,
        label: 'Archive sub-agent sessions',
        hint: 'persist finished sub-agent sessions for grimoire logs',
      },
    ],
    initialValues,
    required: false,
  });

  if (clack.isCancel(selected)) {
    if (!options?.quiet) clack.outro('Cancelled.');
    return;
  }

  const enforcementEnabled = (selected as string[]).includes('enforcement');
  const verboseEnabled = (selected as string[]).includes('verboseLog');
  const archiveEnabled = (selected as string[]).includes('archive');

  // Retention only matters (and is only asked) when archiving stays/turns on.
  const currentRetain = config.insights?.retainRunsPerAgent ?? DEFAULT_RETAIN_RUNS_PER_AGENT;
  let retainValue = currentRetain;
  if (archiveEnabled) {
    const answer = await clack.text({
      message: 'Sessions to keep per agent type',
      initialValue: String(currentRetain),
      validate(value) {
        const n = Number(value);
        if (!Number.isInteger(n) || n < 1) return 'Enter a whole number ≥ 1';
        return undefined;
      },
    });
    // Cancelling the retention prompt keeps the current value rather than aborting.
    if (!clack.isCancel(answer)) retainValue = Number(answer);
  }

  const enforcementChanged = enforcementEnabled !== (config.enforcement ?? false);
  const verboseChanged = verboseEnabled !== (config.verboseEnforcementLog ?? false);
  const archiveChanged = archiveEnabled !== archivingOn;
  const retentionChanged = archiveEnabled && retainValue !== currentRetain;

  if (!enforcementChanged && !verboseChanged && !archiveChanged && !retentionChanged) {
    if (!options?.quiet) clack.outro('No changes.');
    return;
  }

  config.enforcement = enforcementEnabled;
  config.verboseEnforcementLog = verboseEnabled;
  // Disabling leaves any existing retainRunsPerAgent in place (non-destructive).
  config.insights = {
    ...config.insights,
    archive: archiveEnabled,
    ...(archiveEnabled ? { retainRunsPerAgent: retainValue } : {}),
  };
  writeGrimoireConfig(projectDir, config);

  // Hook registration follows the enforcement toggle, but approach-driven
  // subagent hooks are independent of it: they get self-healed on enable and
  // spared on disable.
  if (enforcementChanged) {
    if (enforcementEnabled) {
      ensureEnforceHooks(projectDir, patternAgents);
      if (approachAgents.length > 0) ensureSubagentHooks(projectDir, approachAgents);
      clack.log.success('Enforcement enabled.');
    } else {
      removeEnforceHooks(projectDir, approachAgents);
      clack.log.success('Enforcement disabled.');
    }
  }

  if (verboseChanged) {
    clack.log.success(verboseEnabled ? 'Verbose enforcement log enabled.' : 'Verbose enforcement log disabled.');
  }

  if (archiveChanged) {
    clack.log.success(archiveEnabled ? 'Session archiving enabled.' : 'Session archiving disabled.');
  }

  if (retentionChanged) {
    clack.log.success(`Keeping ${retainValue} sessions per agent type.`);
  }

  if (!options?.quiet) clack.outro('Configuration saved.');
}
