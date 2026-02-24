import { existsSync, readdirSync, statSync } from 'fs';
import { basename, join } from 'path';
import { readAgentMeta, readManifest } from '../enforce.js';

const DESC_MAX = 60;

function truncate(s: string): string {
  return s.length > DESC_MAX ? s.slice(0, DESC_MAX - 1) + '…' : s;
}

export function runList(projectDir: string): void {
  const agentsDir = join(projectDir, '.claude', 'agents');
  const skillsDir = join(projectDir, '.claude', 'skills');

  // Load manifest to determine which items grimoire manages
  let managedAgentNames: Set<string> | null = null;
  let managedSkillDirNames: Set<string> | null = null;
  let enforcedAgents = new Set<string>();
  try {
    const manifest = readManifest(projectDir);
    managedAgentNames = new Set(Object.keys(manifest.agents));
    managedSkillDirNames = new Set(manifest.skills.map((s) => basename(s.path)));
    for (const [name, entry] of Object.entries(manifest.agents)) {
      if (entry.enforce) enforcedAgents.add(name);
    }
  } catch {
    // manifest absent — nothing was installed by grimoire
  }

  // Collect grimoire-managed agents
  const agentNames = managedAgentNames;
  const agentFiles: string[] =
    existsSync(agentsDir) && agentNames !== null
      ? readdirSync(agentsDir)
          .filter((f) => f.endsWith('.md') && agentNames.has(f.replace(/\.md$/, '')))
          .sort()
      : [];

  // Collect grimoire-managed skills (directories containing SKILL.md)
  const skillDirNames = managedSkillDirNames;
  const skillDirs: string[] =
    existsSync(skillsDir) && skillDirNames !== null
      ? readdirSync(skillsDir)
          .filter((f) => {
            const full = join(skillsDir, f);
            return (
              statSync(full).isDirectory() &&
              existsSync(join(full, 'SKILL.md')) &&
              skillDirNames.has(f)
            );
          })
          .sort()
      : [];

  if (agentFiles.length === 0 && skillDirs.length === 0) {
    console.log('No agents or skills installed. Run `grimoire add` to get started.');
    return;
  }

  // Build agent rows
  type Row = { name: string; desc: string; enforced: boolean };
  const agentRows: Row[] = agentFiles.map((f) => {
    const name = f.replace(/\.md$/, '');
    const meta = readAgentMeta(join(agentsDir, f));
    return { name, desc: meta.description, enforced: enforcedAgents.has(name) };
  });

  // Build skill rows
  const skillRows: Row[] = skillDirs.map((d) => {
    const meta = readAgentMeta(join(skillsDir, d, 'SKILL.md'));
    return { name: d, desc: meta.description, enforced: false };
  });

  // Determine padding
  const allNames = [...agentRows, ...skillRows].map((r) => r.name);
  const pad = Math.max(...allNames.map((n) => n.length));

  if (agentRows.length > 0) {
    console.log(`Agents (${agentRows.length}):`);
    for (const row of agentRows) {
      const suffix = row.enforced ? '  [enforced]' : '';
      console.log(`  ${row.name.padEnd(pad)}  ${truncate(row.desc)}${suffix}`);
    }
  }

  if (skillRows.length > 0) {
    if (agentRows.length > 0) console.log('');
    console.log(`Skills (${skillRows.length}):`);
    for (const row of skillRows) {
      console.log(`  ${row.name.padEnd(pad)}  ${truncate(row.desc)}`);
    }
  }

  console.log('');
  console.log(`${agentRows.length} agent(s), ${skillRows.length} skill(s) installed.`);
}
