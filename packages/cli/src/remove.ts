import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'fs';
import { basename, join } from 'path';
import type { InstallItem, RemoveResult } from './types.js';

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
 * Removes entries for the given items from skills-manifest.json.
 * Removes skill entries, agent entries, and agent references from other agents.
 */
export function cleanManifest(
  items: readonly InstallItem[],
  projectDir: string,
): void {
  const manifestPath = join(projectDir, '.claude', 'skills-manifest.json');
  if (!existsSync(manifestPath)) return;

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as SkillsManifest;

  const removedSkillNames = new Set(
    items.filter((i) => i.type === 'skill').map((i) => i.name),
  );
  const removedAgentNames = new Set(
    items.filter((i) => i.type === 'agent').map((i) => i.name),
  );

  // Remove skill entries
  if (removedSkillNames.size > 0) {
    manifest.skills = manifest.skills.filter(
      (s) => !removedSkillNames.has(s.name),
    );
  }

  // Remove agent entries
  for (const name of removedAgentNames) {
    delete manifest.agents[name];
  }

  // Remove skill references from remaining agents
  if (removedSkillNames.size > 0) {
    for (const agentConfig of Object.values(manifest.agents)) {
      agentConfig.always_skills = agentConfig.always_skills.filter(
        (s) => !removedSkillNames.has(s),
      );
      agentConfig.compatible_skills = agentConfig.compatible_skills.filter(
        (s) => !removedSkillNames.has(s),
      );
    }
  }

  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
}
