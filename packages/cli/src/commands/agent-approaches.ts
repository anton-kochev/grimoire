/**
 * `grimoire agent-approaches` — manage enforced approaches for agents.
 *
 * An approach is a predefined binding directive from the built-in catalog
 * (see approaches-catalog.ts), optionally bound to a skill that describes the
 * methodology for this agent's ecosystem. Attached approaches are stored in
 * `.claude/grimoire.json` under `router.agents.<name>.approaches`; the router
 * injects them at SubagentStart and verifies skill-backed ones at
 * SubagentStop. Approaches are their own opt-in — independent of the
 * `enforcement` flag.
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import * as clack from '@clack/prompts';
import {
  readManifest,
  writeManifest,
  readAgentMeta,
  ensureSubagentHooks,
  removeSubagentHooksFor,
} from '../enforce.js';
import type { ManifestApproachEntry } from '../enforce.js';
import { readGrimoireConfig } from '../grimoire-config.js';
import { parseAgentSkills, updateAgentSkills } from '../frontmatter.js';
import { scanAvailableSkills } from './agent-skills.js';
import { APPROACHES_CATALOG, findApproach } from '../approaches-catalog.js';
import type { ApproachDefinition } from '../approaches-catalog.js';

function matchesApproach(skillName: string, skillMatch: readonly string[]): boolean {
  const lower = skillName.toLowerCase();
  return skillMatch.some((m) => lower.includes(m.toLowerCase()));
}

/**
 * Resolves the skill to bind for a newly checked approach:
 * - exactly one assigned frontmatter skill matches → silent bind;
 * - otherwise a select over matching installed skills (assigned first),
 *   with a "none — directive only" escape hatch;
 * - nothing installed matches → directive-only with an info note.
 */
async function resolveBoundSkill(
  agentName: string,
  def: ApproachDefinition,
  assignedSkills: readonly string[],
  installedSkills: ReadonlyArray<{ name: string; description: string }>,
): Promise<string | undefined> {
  if (!def.skillMatch?.length) return undefined;

  // Only installed skills qualify for a silent bind — stale frontmatter must
  // not bind a skill the agent can never load (guaranteed bounce every run).
  const installedNames = new Set(installedSkills.map((s) => s.name));
  const assignedMatches = assignedSkills.filter(
    (s) => matchesApproach(s, def.skillMatch!) && installedNames.has(s),
  );
  if (assignedMatches.length === 1) return assignedMatches[0];

  const installedMatches = installedSkills.filter((s) => matchesApproach(s.name, def.skillMatch!));
  if (installedMatches.length === 0) {
    clack.log.info(
      `No skill matching "${def.label}" is installed — the directive will be injected, ` +
      'but finish-verification is disabled for this approach.',
    );
    return undefined;
  }

  const assignedSet = new Set(assignedSkills);
  const ordered = [...installedMatches].sort(
    (a, b) => Number(assignedSet.has(b.name)) - Number(assignedSet.has(a.name)),
  );

  const choice = await clack.select<string>({
    message: `"${def.label}" is described by a skill. Bind one for ${agentName}:`,
    options: [
      ...ordered.map((s) => ({
        value: s.name,
        label: s.name,
        hint: assignedSet.has(s.name)
          ? 'assigned to agent'
          : s.description.length > 80 ? s.description.slice(0, 80) + '…' : s.description,
      })),
      { value: '', label: 'none — enforce the directive only' },
    ],
  });

  if (clack.isCancel(choice) || !choice) return undefined;
  return choice as string;
}

/** Warns when the agent declares an explicit tools list without the Skill tool. */
function warnIfSkillToolMissing(agentContent: string, agentName: string): void {
  const fm = agentContent.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const toolsLine = fm?.[1]?.match(/^tools:\s*(.+)$/m)?.[1];
  if (!toolsLine) return; // no explicit tools — the agent inherits all, Skill included

  const tools = toolsLine.split(',').map((t) => t.trim());
  if (!tools.includes('Skill')) {
    clack.log.warn(
      `${agentName} declares tools without "Skill" — it cannot invoke the bound skill ` +
      'at runtime. Add Skill to its tools line.',
    );
  }
}

export async function runAgentApproaches(projectDir: string): Promise<void> {
  let manifest;
  try {
    manifest = readManifest(projectDir);
  } catch {
    clack.log.error('No grimoire.json config found. Run `grimoire add` first.');
    process.exit(1);
  }

  const agentsDir = join(projectDir, '.claude', 'agents');
  if (!existsSync(agentsDir)) {
    clack.log.error('No agents installed. Run `grimoire add` first.');
    process.exit(1);
  }

  const managedNames = new Set(Object.keys(manifest.agents ?? {}));
  const agentFiles = readdirSync(agentsDir)
    .filter((f) => f.endsWith('.md'))
    .filter((f) => {
      const fsName = f.replace(/\.md$/, '');
      return managedNames.has(fsName) ||
        [...managedNames].some((key) => key.endsWith(`.${fsName}`));
    })
    .sort();

  if (agentFiles.length === 0) {
    console.log('No grimoire-managed agents found. Run `grimoire add` to install agents.');
    return;
  }

  clack.intro('Agent Approaches');

  const agentOptions = agentFiles.map((f) => {
    const fsName = f.replace(/\.md$/, '');
    // Approaches are keyed (and hook matchers written) by the manifest key,
    // so a legacy non-namespaced filename must resolve back to its managed
    // entry — writing under the bare basename would enforce nothing.
    const manifestKey = managedNames.has(fsName)
      ? fsName
      : [...managedNames].find((key) => key.endsWith(`.${fsName}`)) ?? fsName;
    const meta = readAgentMeta(join(agentsDir, f));
    return {
      value: manifestKey,
      label: manifestKey,
      hint: meta.description.length > 80 ? meta.description.slice(0, 80) + '…' : meta.description,
    };
  });

  const selectedAgent = await clack.select<string>({
    message: 'Select an agent to manage approaches:',
    options: agentOptions,
  });

  if (clack.isCancel(selectedAgent)) {
    clack.cancel('Cancelled.');
    return;
  }

  await runAgentApproachesFor(projectDir, selectedAgent as string);

  clack.outro('Done.');
}

/**
 * Runs the check/uncheck flow for a specific agent.
 * Used by both the standalone `agent-approaches` command and the unified `list` flow.
 */
export async function runAgentApproachesFor(projectDir: string, agentName: string): Promise<void> {
  const manifest = readManifest(projectDir);
  if (!manifest.agents) manifest.agents = {};
  const entry = manifest.agents[agentName] ?? {};
  const current = entry.approaches ?? [];

  if (current.length > 0) {
    clack.log.info(
      `Enforced approaches: ${current.map((a) => (a.skill ? `${a.name} (${a.skill})` : a.name)).join(', ')}`,
    );
  } else {
    clack.log.info('No approaches enforced.');
  }

  // Catalog entries plus any configured ids the catalog no longer knows —
  // those must stay uncheckable rather than silently disappearing.
  const catalogIds = new Set(APPROACHES_CATALOG.map((d) => d.id));
  const customEntries = current.filter((a) => !catalogIds.has(a.name));

  const selected = await clack.multiselect<string>({
    message: 'Select approaches to enforce',
    options: [
      ...APPROACHES_CATALOG.map((d) => ({ value: d.id, label: d.label, hint: d.description })),
      ...customEntries.map((a) => ({ value: a.name, label: a.name, hint: 'custom' })),
    ],
    initialValues: current.map((a) => a.name),
    required: false,
  });

  if (clack.isCancel(selected)) return;

  const selectedSet = new Set(selected as string[]);
  const currentNames = new Set(current.map((a) => a.name));
  const kept = current.filter((a) => selectedSet.has(a.name));
  const addedIds = (selected as string[]).filter((n) => !currentNames.has(n));
  const removedNames = current.map((a) => a.name).filter((n) => !selectedSet.has(n));

  if (addedIds.length === 0 && removedNames.length === 0) {
    clack.log.info('No changes.');
    return;
  }

  const agentPath = join(projectDir, '.claude', 'agents', `${agentName}.md`);
  let agentContent = existsSync(agentPath) ? readFileSync(agentPath, 'utf-8') : '';
  const assignedSkills = agentContent ? parseAgentSkills(agentContent) : [];
  const installedSkills = scanAvailableSkills(projectDir);

  const added: ManifestApproachEntry[] = [];
  for (const id of addedIds) {
    const def = findApproach(id);
    if (!def) continue; // only catalog entries can be newly checked

    const approach: ManifestApproachEntry = { name: def.id, directive: def.directive };
    const skill = await resolveBoundSkill(agentName, def, assignedSkills, installedSkills);

    if (skill) {
      approach.skill = skill;

      if (agentContent && !assignedSkills.includes(skill)) {
        const confirmed = await clack.confirm({
          message: `Also add "${skill}" to the agent's skills list?`,
          initialValue: true,
        });
        if (!clack.isCancel(confirmed) && confirmed) {
          agentContent = updateAgentSkills(agentContent, [...parseAgentSkills(agentContent), skill]);
          writeFileSync(agentPath, agentContent);
          assignedSkills.push(skill);
        }
      }

      if (agentContent) warnIfSkillToolMissing(agentContent, agentName);
    }

    added.push(approach);
    clack.log.success(
      skill ? `Enforced "${def.label}" → bound skill: ${skill}` : `Enforced "${def.label}" (directive only)`,
    );
  }

  for (const name of removedNames) {
    clack.log.success(`Removed "${findApproach(name)?.label ?? name}".`);
  }

  const next = [...kept, ...added];
  if (next.length > 0) {
    manifest.agents[agentName] = { ...entry, approaches: next };
  } else {
    const { approaches: _removed, ...rest } = entry;
    manifest.agents[agentName] = rest;
  }
  writeManifest(projectDir, manifest);

  // Approaches are their own opt-in: hooks are ensured regardless of the
  // enforcement flag, and removed only when nothing is left needing them.
  if (next.length > 0) {
    ensureSubagentHooks(projectDir, [agentName]);
  } else {
    const enforcementOn = readGrimoireConfig(projectDir).enforcement === true;
    const hasActivePatterns = enforcementOn && (entry.file_patterns?.length ?? 0) > 0;
    if (!hasActivePatterns) {
      removeSubagentHooksFor(projectDir, agentName);
    }
  }
}
