import { existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { readAgentMeta, readManifest } from '../enforce.js';

const DESC_MAX = 60;

function truncate(s: string): string {
  return s.length > DESC_MAX ? s.slice(0, DESC_MAX - 1) + '…' : s;
}

export function runList(projectDir: string): void {
  const agentsDir = join(projectDir, '.claude', 'agents');
  const skillsDir = join(projectDir, '.claude', 'skills');

  // Collect agents
  const agentFiles: string[] = existsSync(agentsDir)
    ? readdirSync(agentsDir)
        .filter((f) => f.endsWith('.md'))
        .sort()
    : [];

  // Collect skills (directories containing SKILL.md)
  const skillDirs: string[] = existsSync(skillsDir)
    ? readdirSync(skillsDir)
        .filter((f) => {
          const full = join(skillsDir, f);
          return statSync(full).isDirectory() && existsSync(join(full, 'SKILL.md'));
        })
        .sort()
    : [];

  if (agentFiles.length === 0 && skillDirs.length === 0) {
    console.log('No agents or skills installed. Run `grimoire add` to get started.');
    return;
  }

  // Read enforce status from manifest (best-effort)
  let enforcedAgents = new Set<string>();
  try {
    const manifest = readManifest(projectDir);
    for (const [name, entry] of Object.entries(manifest.agents)) {
      if (entry.enforce) enforcedAgents.add(name);
    }
  } catch {
    // manifest absent — no enforce info
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
