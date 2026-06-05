import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { basename, join } from 'path';
import type { PackManifest } from './types.js';

interface HookEntry {
  readonly matcher: string;
  readonly hooks: ReadonlyArray<{ readonly type: string; readonly command: string }>;
}

/**
 * Removes legacy bare matching hooks from `.claude/settings.json`.
 * Enforcement hooks (`--enforce`) and subagent hooks are preserved.
 */
export function mergeSettings(projectDir: string): void {
  const settingsPath = join(projectDir, '.claude', 'settings.json');
  if (!existsSync(settingsPath)) return;

  const settings = JSON.parse(readFileSync(settingsPath, 'utf-8')) as Record<string, unknown>;
  const hooks = settings['hooks'] as Record<string, HookEntry[]> | undefined;
  if (!hooks) return;

  if (hooks['UserPromptSubmit']) {
    hooks['UserPromptSubmit'] = hooks['UserPromptSubmit'].filter(
      (entry) => !entry.hooks.some((h) => h.command.includes('@grimoire-cc/router'))
    );
    if (hooks['UserPromptSubmit'].length === 0) delete hooks['UserPromptSubmit'];
  }

  if (hooks['PreToolUse']) {
    hooks['PreToolUse'] = hooks['PreToolUse'].filter((entry) =>
      !entry.hooks.some((h) => h.command.includes('@grimoire-cc/router') && !h.command.includes('--enforce'))
    );
    if (hooks['PreToolUse'].length === 0) delete hooks['PreToolUse'];
  }

  if (Object.keys(hooks).length > 0) {
    settings['hooks'] = hooks;
  } else {
    delete settings['hooks'];
  }
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
}

interface ManifestSkill {
  path: string;
  name: string;
  description?: string;
}

interface ManifestAgentEntry {
  file_patterns?: string[];
}

interface SkillsManifest {
  version: string;
  config?: Record<string, unknown>;
  skills: ManifestSkill[];
  agents: Record<string, ManifestAgentEntry>;
}

/**
 * Merges pack skill and agent entries into `.claude/grimoire.json` (router key).
 * Creates the file with defaults if it doesn't exist. Preserves existing entries.
 */
export function mergeManifest(projectDir: string, packManifest: PackManifest): void {
  const claudeDir = join(projectDir, '.claude');
  mkdirSync(claudeDir, { recursive: true });

  const configPath = join(claudeDir, 'grimoire.json');

  let config: Record<string, unknown> = {};
  if (existsSync(configPath)) {
    try { config = JSON.parse(readFileSync(configPath, 'utf-8')) as Record<string, unknown>; } catch { /* ignore */ }
  }

  let manifest: SkillsManifest;
  if (config['router'] && typeof config['router'] === 'object') {
    manifest = config['router'] as SkillsManifest;
  } else {
    manifest = {
      version: '2.0.0',
      skills: [],
      agents: {},
    };
  }

  // Merge all skills so they are tracked as managed items
  for (const skill of packManifest.skills) {
    const dirName = basename(skill.path);
    const skillPath = `.claude/skills/${dirName}`;
    const existingIndex = manifest.skills.findIndex((s) => s.path === skillPath);

    const entry: ManifestSkill = {
      path: skillPath,
      name: skill.name,
      description: skill.description,
    };

    if (existingIndex >= 0) {
      manifest.skills[existingIndex] = entry;
    } else {
      manifest.skills.push(entry);
    }
  }

  // Merge agents — preserve existing entry (file_patterns) when present
  for (const agent of packManifest.agents) {
    if (!manifest.agents[agent.name]) {
      manifest.agents[agent.name] = {};
    }
    // Strip leftover enforce flags (migrated away)
    delete (manifest.agents[agent.name] as Record<string, unknown>)['enforce'];
    // Write file_patterns from pack definition when provided
    if (agent.file_patterns && agent.file_patterns.length > 0) {
      manifest.agents[agent.name]!.file_patterns = [...agent.file_patterns];
    }
  }

  config['router'] = manifest;
  writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
}

/**
 * Sets up the router by merging hook config and skill manifest.
 * Subagent skill injection is handled natively by Claude Code via the `skills:`
 * field in agent frontmatter — no install-time hooks needed. SubagentStart/Stop
 * registry hooks are managed by ensureEnforceHooks for enforced agents only.
 */
export function setupRouter(projectDir: string, packManifest: PackManifest, options?: { quiet?: boolean }): void {
  mergeSettings(projectDir);
  mergeManifest(projectDir, packManifest);

  if (!options?.quiet) {
    console.log('\nGrimoire router metadata configured:');
    console.log('  config: .claude/grimoire.json');
  }
}

function isRouterInstalled(projectDir: string): boolean {
  return existsSync(join(projectDir, 'node_modules', '@grimoire-cc', 'router'));
}
