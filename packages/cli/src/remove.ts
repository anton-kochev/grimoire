import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'fs';
import { basename, join } from 'path';
import type { InstallItem, PackManifest, RemoveResult } from './types.js';

/**
 * Scans the project's .claude/ directory for installed agents and skills.
 */
export function scanInstalled(projectDir: string): readonly InstallItem[] {
  const items: InstallItem[] = [];

  const agentsDir = join(projectDir, '.claude', 'agents');
  if (existsSync(agentsDir)) {
    for (const file of readdirSync(agentsDir)) {
      if (file.endsWith('.md')) {
        items.push({
          type: 'agent',
          name: basename(file, '.md'),
          sourcePath: '',
          description: '',
        });
      }
    }
  }

  const skillsDir = join(projectDir, '.claude', 'skills');
  if (existsSync(skillsDir)) {
    for (const entry of readdirSync(skillsDir)) {
      const fullPath = join(skillsDir, entry);
      if (statSync(fullPath).isDirectory()) {
        items.push({
          type: 'skill',
          name: entry,
          sourcePath: '',
          description: '',
        });
      }
    }
  }

  return items;
}

/**
 * Removes agent files and skill directories from the project.
 */
export function removeItems(
  items: readonly InstallItem[],
  projectDir: string,
): readonly RemoveResult[] {
  return items.map((item) => {
    const targetPath =
      item.type === 'agent'
        ? join(projectDir, '.claude', 'agents', `${item.name}.md`)
        : join(projectDir, '.claude', 'skills', item.name);

    if (!existsSync(targetPath)) {
      return { item, removed: false };
    }

    rmSync(targetPath, { recursive: true, force: true });
    return { item, removed: true };
  });
}

interface ManifestSkill {
  path: string;
  name: string;
  [key: string]: unknown;
}

interface AgentConfig {
  always_skills: string[];
  compatible_skills: string[];
}

interface SkillsManifest {
  version: string;
  config: Record<string, unknown>;
  skills: ManifestSkill[];
  agents: Record<string, AgentConfig>;
}

/**
 * Converts a PackManifest into InstallItem[] using filesystem-derived names.
 */
export function resolvePackItems(packManifest: PackManifest): readonly InstallItem[] {
  const items: InstallItem[] = [];

  for (const agent of packManifest.agents) {
    items.push({
      type: 'agent',
      name: basename(agent.path, '.md'),
      sourcePath: '',
      description: agent.description,
    });
  }

  for (const skill of packManifest.skills) {
    items.push({
      type: 'skill',
      name: basename(skill.path),
      sourcePath: '',
      description: skill.description,
    });
  }

  return items;
}

/**
 * Removes entries for the given items from skills-manifest.json.
 * Removes skill entries, agent entries, and agent references from other agents.
 *
 * Skills are matched by path (`.claude/skills/{dirName}`) to handle namespaced names.
 * An optional `manifestNames` parameter provides additional agent/skill names
 * to match (for pack removal where manifest names differ from filesystem names).
 */
export function cleanManifest(
  items: readonly InstallItem[],
  projectDir: string,
  manifestNames?: {
    readonly agentNames?: readonly string[];
    readonly skillNames?: readonly string[];
  },
): void {
  const manifestPath = join(projectDir, '.claude', 'skills-manifest.json');
  if (!existsSync(manifestPath)) return;

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as SkillsManifest;

  // Build path-based removal set for skills
  const removedSkillPaths = new Set(
    items.filter((i) => i.type === 'skill').map((i) => `.claude/skills/${i.name}`),
  );

  // Build agent removal set from both filesystem names and manifest names
  const removedAgentNames = new Set(
    items.filter((i) => i.type === 'agent').map((i) => i.name),
  );
  if (manifestNames?.agentNames) {
    for (const name of manifestNames.agentNames) {
      removedAgentNames.add(name);
    }
  }

  // Remove skill entries by path, collecting their manifest names for reference cleanup
  const removedSkillManifestNames = new Set<string>();
  if (manifestNames?.skillNames) {
    for (const name of manifestNames.skillNames) {
      removedSkillManifestNames.add(name);
    }
  }

  if (removedSkillPaths.size > 0) {
    const kept: ManifestSkill[] = [];
    for (const s of manifest.skills) {
      if (removedSkillPaths.has(s.path)) {
        removedSkillManifestNames.add(s.name);
      } else {
        kept.push(s);
      }
    }
    manifest.skills = kept;
  }

  // Remove agent entries
  for (const name of removedAgentNames) {
    delete manifest.agents[name];
  }

  // Remove skill references from remaining agents
  if (removedSkillManifestNames.size > 0) {
    for (const agentConfig of Object.values(manifest.agents)) {
      agentConfig.always_skills = agentConfig.always_skills.filter(
        (s) => !removedSkillManifestNames.has(s),
      );
      agentConfig.compatible_skills = agentConfig.compatible_skills.filter(
        (s) => !removedSkillManifestNames.has(s),
      );
    }
  }

  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
}
