import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { basename, join } from 'path';
import type { PackManifest } from './types.js';

const SKILL_ROUTER_COMMAND = 'npx @grimoire-cc/router';

interface HookEntry {
  readonly matcher: string;
  readonly hooks: ReadonlyArray<{ readonly type: string; readonly command: string }>;
}

function hasRouterHook(entries: readonly HookEntry[]): boolean {
  return entries.some((entry) =>
    entry.hooks.some((h) => h.command.includes('@grimoire-cc/router')),
  );
}

function makeHookEntry(matcher: string): HookEntry {
  return {
    matcher,
    hooks: [{ type: 'command', command: SKILL_ROUTER_COMMAND }],
  };
}

/**
 * Merges router hook entries into `.claude/settings.json`.
 * Creates the file if it doesn't exist. Preserves existing entries.
 */
export function mergeSettings(projectDir: string): void {
  const claudeDir = join(projectDir, '.claude');
  mkdirSync(claudeDir, { recursive: true });

  const settingsPath = join(claudeDir, 'settings.json');

  let settings: Record<string, unknown> = {};
  if (existsSync(settingsPath)) {
    settings = JSON.parse(readFileSync(settingsPath, 'utf-8')) as Record<string, unknown>;
  }

  const hooks = (settings['hooks'] ?? {}) as Record<string, HookEntry[]>;

  if (!hooks['UserPromptSubmit']) {
    hooks['UserPromptSubmit'] = [];
  }
  if (!hasRouterHook(hooks['UserPromptSubmit'])) {
    hooks['UserPromptSubmit'].push(makeHookEntry(''));
  }

  if (!hooks['PreToolUse']) {
    hooks['PreToolUse'] = [];
  }
  if (!hasRouterHook(hooks['PreToolUse'])) {
    hooks['PreToolUse'].push(makeHookEntry('Edit|Write|MultiEdit'));
  }

  settings['hooks'] = hooks;
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
}

interface ManifestSkill {
  path: string;
  name: string;
  description?: string;
  triggers: Record<string, unknown>;
}

interface ManifestAgentEntry {
  file_patterns?: string[];
}

interface SkillsManifest {
  version: string;
  config: Record<string, unknown>;
  skills: ManifestSkill[];
  agents: Record<string, ManifestAgentEntry>;
}

const DEFAULT_CONFIG = {
  weights: {
    keywords: 1.0,
    file_extensions: 1.5,
    patterns: 2.0,
    file_paths: 2.5,
  },
  activation_threshold: 3.0,
  pretooluse_threshold: 1.5,
};

/**
 * Merges pack skill triggers and agent entries into `.claude/skills-manifest.json`.
 * Creates the file with defaults if it doesn't exist. Preserves existing entries.
 */
export function mergeManifest(projectDir: string, packManifest: PackManifest): void {
  const claudeDir = join(projectDir, '.claude');
  mkdirSync(claudeDir, { recursive: true });

  const manifestPath = join(claudeDir, 'skills-manifest.json');

  let manifest: SkillsManifest;
  if (existsSync(manifestPath)) {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as SkillsManifest;
  } else {
    manifest = {
      version: '2.0.0',
      config: { ...DEFAULT_CONFIG },
      skills: [],
      agents: {},
    };
  }

  // Merge skills with triggers
  for (const skill of packManifest.skills) {
    if (!skill.triggers) continue;

    const dirName = basename(skill.path);
    const skillPath = `.claude/skills/${dirName}`;
    const existingIndex = manifest.skills.findIndex((s) => s.path === skillPath);

    const entry: ManifestSkill = {
      path: skillPath,
      name: skill.name,
      description: skill.description,
      triggers: { ...skill.triggers },
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

  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
}

function hasAgentHook(entries: readonly HookEntry[], agentName: string, flag: string): boolean {
  return entries.some(
    (e) =>
      e.matcher === agentName &&
      e.hooks.some((h) => h.command.includes(flag) && h.command.includes(`--agent=${agentName}`)),
  );
}

/**
 * Writes per-agent SubagentStart/Stop hooks into settings.json.
 * Called at install time so skill injection works for all agents, not just enforced ones.
 */
function mergeAgentHooks(projectDir: string, agentNames: readonly string[]): void {
  const claudeDir = join(projectDir, '.claude');
  mkdirSync(claudeDir, { recursive: true });
  const settingsPath = join(claudeDir, 'settings.json');

  let settings: Record<string, unknown> = {};
  if (existsSync(settingsPath)) {
    settings = JSON.parse(readFileSync(settingsPath, 'utf-8')) as Record<string, unknown>;
  }

  const hooks = (settings['hooks'] ?? {}) as Record<string, HookEntry[]>;
  if (!hooks['SubagentStart']) hooks['SubagentStart'] = [];
  if (!hooks['SubagentStop']) hooks['SubagentStop'] = [];

  for (const name of agentNames) {
    if (!hasAgentHook(hooks['SubagentStart']!, name, '--subagent-start')) {
      hooks['SubagentStart']!.push({
        matcher: name,
        hooks: [{ type: 'command', command: `${SKILL_ROUTER_COMMAND} --subagent-start --agent=${name}` }],
      });
    }
    if (!hasAgentHook(hooks['SubagentStop']!, name, '--subagent-stop')) {
      hooks['SubagentStop']!.push({
        matcher: name,
        hooks: [{ type: 'command', command: `${SKILL_ROUTER_COMMAND} --subagent-stop --agent=${name}` }],
      });
    }
  }

  settings['hooks'] = hooks;
  writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
}

/**
 * Sets up the router by merging hook config and skill manifest.
 */
export function setupRouter(projectDir: string, packManifest: PackManifest): void {
  mergeSettings(projectDir);
  mergeManifest(projectDir, packManifest);
  if (packManifest.agents.length > 0) {
    mergeAgentHooks(projectDir, packManifest.agents.map((a) => a.name));
  }

  console.log('\nSkill router configured:');
  console.log('  hooks: .claude/settings.json');
  console.log('  manifest: .claude/skills-manifest.json');

  if (!isRouterInstalled(projectDir)) {
    console.log('\n⚠ @grimoire-cc/router is not installed.');
    console.log('  Auto-activation requires it. Install with:');
    console.log('  npm install -D @grimoire-cc/router');
  }
}

function isRouterInstalled(projectDir: string): boolean {
  return existsSync(join(projectDir, 'node_modules', '@grimoire-cc', 'router'));
}
