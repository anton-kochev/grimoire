/**
 * `grimoire agent-skills` — manage skill assignments for agents.
 */

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { join, basename } from 'path';
import * as clack from '@clack/prompts';
import { readManifest, readAgentMeta } from '../enforce.js';
import { parseAgentSkills, updateAgentSkills } from '../frontmatter.js';

type Action = 'add' | 'remove' | 'done';

function readSkillDescription(skillMdPath: string): string {
  try {
    const content = readFileSync(skillMdPath, 'utf-8');
    const fm = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!fm?.[1]) return '';
    return fm[1].match(/^description:\s*(.+)$/m)?.[1]?.trim().replace(/^["']|["']$/g, '') ?? '';
  } catch {
    return '';
  }
}

function scanAvailableSkills(projectDir: string): Array<{ name: string; description: string }> {
  const skillsDir = join(projectDir, '.claude', 'skills');
  if (!existsSync(skillsDir)) return [];

  return readdirSync(skillsDir)
    .filter((f) => {
      const full = join(skillsDir, f);
      return statSync(full).isDirectory() && existsSync(join(full, 'SKILL.md'));
    })
    .sort()
    .map((name) => ({
      name,
      description: readSkillDescription(join(skillsDir, name, 'SKILL.md')),
    }));
}

export async function runAgentSkills(projectDir: string): Promise<void> {
  // Load manifest to filter to grimoire-managed agents
  let manifest;
  try {
    manifest = readManifest(projectDir);
  } catch {
    clack.log.error('No skills-manifest.json found. Run `grimoire add` first.');
    process.exit(1);
  }

  const agentsDir = join(projectDir, '.claude', 'agents');
  if (!existsSync(agentsDir)) {
    clack.log.error('No agents installed. Run `grimoire add` first.');
    process.exit(1);
  }

  // Build list of grimoire-managed agents
  const managedNames = new Set(Object.keys(manifest.agents));
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

  clack.intro('Agent Skills');

  // Select an agent
  const agentOptions = agentFiles.map((f) => {
    const fsName = f.replace(/\.md$/, '');
    const meta = readAgentMeta(join(agentsDir, f));
    return {
      value: fsName,
      label: fsName,
      hint: meta.description.length > 80 ? meta.description.slice(0, 80) + '…' : meta.description,
    };
  });

  const selectedAgent = await clack.select<string>({
    message: 'Select an agent to manage skills:',
    options: agentOptions,
  });

  if (clack.isCancel(selectedAgent)) {
    clack.cancel('Cancelled.');
    return;
  }

  const agentName = selectedAgent as string;
  const agentPath = join(agentsDir, `${agentName}.md`);

  // Action loop
  while (true) {
    const content = readFileSync(agentPath, 'utf-8');
    const currentSkills = parseAgentSkills(content);

    if (currentSkills.length > 0) {
      clack.log.info(`Current skills: ${currentSkills.join(', ')}`);
    } else {
      clack.log.info('No skills assigned.');
    }

    const action = await clack.select<Action>({
      message: 'What would you like to do?',
      options: [
        { value: 'add' as const, label: 'Add skills' },
        { value: 'remove' as const, label: 'Remove skills', ...(currentSkills.length === 0 && { hint: 'none to remove' }) },
        { value: 'done' as const, label: 'Done' },
      ],
    });

    if (clack.isCancel(action) || action === 'done') break;

    if (action === 'add') {
      const available = scanAvailableSkills(projectDir);
      const currentSet = new Set(currentSkills);
      const addable = available.filter((s) => !currentSet.has(s.name));

      if (addable.length === 0) {
        clack.log.warn('No additional skills available to add.');
        continue;
      }

      const selected = await clack.multiselect<string>({
        message: 'Select skills to add:',
        options: addable.map((s) => ({
          value: s.name,
          label: s.name,
          hint: s.description.length > 80 ? s.description.slice(0, 80) + '…' : s.description,
        })),
        required: false,
      });

      if (clack.isCancel(selected)) continue;

      const toAdd = selected as string[];
      if (toAdd.length > 0) {
        const updated = updateAgentSkills(content, [...currentSkills, ...toAdd]);
        writeFileSync(agentPath, updated);
        clack.log.success(`Added ${toAdd.length} skill(s).`);
      }
    }

    if (action === 'remove') {
      if (currentSkills.length === 0) {
        clack.log.warn('No skills to remove.');
        continue;
      }

      const selected = await clack.multiselect<string>({
        message: 'Select skills to remove:',
        options: currentSkills.map((s) => ({ value: s, label: s })),
        required: false,
      });

      if (clack.isCancel(selected)) continue;

      const toRemove = new Set(selected as string[]);
      if (toRemove.size > 0) {
        const remaining = currentSkills.filter((s) => !toRemove.has(s));
        const updated = updateAgentSkills(content, remaining);
        writeFileSync(agentPath, updated);
        clack.log.success(`Removed ${toRemove.size} skill(s).`);
      }
    }
  }

  clack.outro('Done.');
}
