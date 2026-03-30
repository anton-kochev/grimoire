/**
 * Utilities for agent enforcement.
 * Manages enforcement hook entries in settings.json and reads the skills manifest.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

// =============================================================================
// Manifest types (local, minimal — parallel to setup.ts)
// =============================================================================

export interface ManifestAgentEntry {
  file_patterns?: string[];
}

interface ManifestSkill {
  path: string;
  name: string;
  [key: string]: unknown;
}

export interface SkillsManifest {
  version: string;
  config: Record<string, unknown>;
  skills: ManifestSkill[];
  agents: Record<string, ManifestAgentEntry>;
}

// =============================================================================
// Settings types (local, minimal)
// =============================================================================

interface HookEntry {
  matcher: string;
  hooks: Array<{ type: string; command: string }>;
}

interface ClaudeSettings {
  hooks?: Record<string, HookEntry[]>;
  [key: string]: unknown;
}

// =============================================================================
// Manifest read/write
// =============================================================================

export function readManifest(projectDir: string): SkillsManifest {
  const configPath = join(projectDir, '.claude', 'grimoire.json');
  if (!existsSync(configPath)) {
    throw new Error(`Config not found: ${configPath}`);
  }
  const config = JSON.parse(readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
  if (!config['router'] || typeof config['router'] !== 'object') {
    throw new Error(`No router configuration in: ${configPath}`);
  }
  const manifest = config['router'] as SkillsManifest;

  // Strip leftover enforce flags from agent entries (migrated away)
  if (manifest.agents) {
    for (const entry of Object.values(manifest.agents)) {
      delete (entry as Record<string, unknown>)['enforce'];
    }
  }

  return manifest;
}

export function writeManifest(projectDir: string, manifest: SkillsManifest): void {
  const configPath = join(projectDir, '.claude', 'grimoire.json');
  let config: Record<string, unknown> = {};
  if (existsSync(configPath)) {
    try { config = JSON.parse(readFileSync(configPath, 'utf-8')) as Record<string, unknown>; } catch { /* ignore */ }
  }
  config['router'] = manifest;
  writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
}

// =============================================================================
// Agent metadata
// =============================================================================

export interface AgentMeta {
  name: string;
  description: string;
}

/**
 * Reads name and description from YAML frontmatter of an agent .md file.
 */
export function readAgentMeta(agentPath: string): AgentMeta {
  let content: string;
  try {
    content = readFileSync(agentPath, 'utf-8');
  } catch {
    return { name: '', description: '' };
  }

  const fm = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fm?.[1]) return { name: '', description: '' };

  const block = fm[1];
  const nameLine = block.match(/^name:\s*(.+)$/m);
  const descLine = block.match(/^description:\s*(.+)$/m);

  return {
    name: nameLine?.[1]?.trim() ?? '',
    description: descLine?.[1]?.trim().replace(/^["']|["']$/g, '') ?? '',
  };
}

// =============================================================================
// Hook management
// =============================================================================

const ENFORCE_COMMAND = 'npx @grimoire-cc/router --enforce';

function makeSubagentStartCmd(agentName: string): string {
  return `npx @grimoire-cc/router --subagent-start --agent=${agentName}`;
}

function makeSubagentStopCmd(agentName: string): string {
  return `npx @grimoire-cc/router --subagent-stop --agent=${agentName}`;
}

function readSettings(projectDir: string): ClaudeSettings {
  const path = join(projectDir, '.claude', 'settings.json');
  if (!existsSync(path)) return {};
  return JSON.parse(readFileSync(path, 'utf-8')) as ClaudeSettings;
}

function writeSettings(projectDir: string, settings: ClaudeSettings): void {
  const claudeDir = join(projectDir, '.claude');
  mkdirSync(claudeDir, { recursive: true });
  writeFileSync(join(claudeDir, 'settings.json'), JSON.stringify(settings, null, 2) + '\n');
}

/**
 * Returns true if a PreToolUse entry with --enforce already exists.
 */
export function hasEnforcePreToolUseHook(entries: readonly HookEntry[]): boolean {
  return entries.some((e) => e.hooks.some((h) => h.command.includes('--enforce')));
}

/**
 * Returns true if a SubagentStart/Stop entry with the new --agent=<name> format already exists.
 */
export function hasSubagentHook(
  entries: readonly HookEntry[],
  agentName: string,
  flag: '--subagent-start' | '--subagent-stop',
): boolean {
  return entries.some(
    (e) =>
      e.matcher === agentName &&
      e.hooks.some((h) => h.command.includes(flag) && h.command.includes(`--agent=${agentName}`)),
  );
}

/**
 * Idempotently adds PreToolUse + SubagentStart/Stop hook entries for all enforced agents.
 */
export function ensureEnforceHooks(projectDir: string, agentNames: readonly string[]): void {
  const settings = readSettings(projectDir);
  const hooks = (settings.hooks ?? {}) as Record<string, HookEntry[]>;

  // PreToolUse enforcement hook
  if (!hooks['PreToolUse']) hooks['PreToolUse'] = [];
  if (!hasEnforcePreToolUseHook(hooks['PreToolUse'])) {
    hooks['PreToolUse'].push({
      matcher: 'Edit|Write|MultiEdit',
      hooks: [{ type: 'command', command: ENFORCE_COMMAND }],
    });
  }

  // Migrate old-format hooks (without --agent=) to new format
  if (hooks['SubagentStart']) {
    hooks['SubagentStart'] = hooks['SubagentStart'].filter(
      (e) => !e.hooks.some((h) => h.command.includes('--subagent-start') && !h.command.includes('--agent=')),
    );
  }
  if (hooks['SubagentStop']) {
    hooks['SubagentStop'] = hooks['SubagentStop'].filter(
      (e) => !e.hooks.some((h) => h.command.includes('--subagent-stop') && !h.command.includes('--agent=')),
    );
  }

  // Per-agent SubagentStart/Stop hooks
  if (!hooks['SubagentStart']) hooks['SubagentStart'] = [];
  if (!hooks['SubagentStop']) hooks['SubagentStop'] = [];

  for (const agentName of agentNames) {
    if (!hasSubagentHook(hooks['SubagentStart']!, agentName, '--subagent-start')) {
      hooks['SubagentStart']!.push({
        matcher: agentName,
        hooks: [{ type: 'command', command: makeSubagentStartCmd(agentName) }],
      });
    }
    if (!hasSubagentHook(hooks['SubagentStop']!, agentName, '--subagent-stop')) {
      hooks['SubagentStop']!.push({
        matcher: agentName,
        hooks: [{ type: 'command', command: makeSubagentStopCmd(agentName) }],
      });
    }
  }

  settings.hooks = hooks;
  writeSettings(projectDir, settings);
}

/**
 * Removes SubagentStart/Stop hook entries for a specific agent.
 * Leaves all other hooks (PreToolUse, other agents) intact.
 * No-op if the file or hooks don't exist.
 */
export function removeSubagentHooksFor(projectDir: string, agentName: string): void {
  const settings = readSettings(projectDir);
  if (!settings.hooks) return;

  const hooks = settings.hooks as Record<string, HookEntry[]>;

  if (hooks['SubagentStart']) {
    hooks['SubagentStart'] = hooks['SubagentStart'].filter(
      (e) =>
        !(
          e.matcher === agentName &&
          e.hooks.some((h) => h.command.includes('--subagent-start') && h.command.includes(`--agent=${agentName}`))
        ),
    );
    if (hooks['SubagentStart'].length === 0) delete hooks['SubagentStart'];
  }

  if (hooks['SubagentStop']) {
    hooks['SubagentStop'] = hooks['SubagentStop'].filter(
      (e) =>
        !(
          e.matcher === agentName &&
          e.hooks.some((h) => h.command.includes('--subagent-stop') && h.command.includes(`--agent=${agentName}`))
        ),
    );
    if (hooks['SubagentStop'].length === 0) delete hooks['SubagentStop'];
  }

  if (Object.keys(hooks).length > 0) {
    settings.hooks = hooks;
  } else {
    delete settings.hooks;
  }
  writeSettings(projectDir, settings);
}

/**
 * Removes all enforcement-related hook entries from settings.json.
 * No-op if the file or hooks don't exist.
 */
export function removeEnforceHooks(projectDir: string): void {
  const settings = readSettings(projectDir);
  if (!settings.hooks) return;

  const hooks = settings.hooks as Record<string, HookEntry[]>;

  if (hooks['PreToolUse']) {
    hooks['PreToolUse'] = hooks['PreToolUse'].filter(
      (e) => !e.hooks.some((h) => h.command.includes('--enforce')),
    );
    if (hooks['PreToolUse'].length === 0) delete hooks['PreToolUse'];
  }

  if (hooks['SubagentStart']) {
    hooks['SubagentStart'] = hooks['SubagentStart'].filter(
      (e) => !e.hooks.some((h) => h.command.includes('--subagent-start')),
    );
    if (hooks['SubagentStart'].length === 0) delete hooks['SubagentStart'];
  }

  if (hooks['SubagentStop']) {
    hooks['SubagentStop'] = hooks['SubagentStop'].filter(
      (e) => !e.hooks.some((h) => h.command.includes('--subagent-stop')),
    );
    if (hooks['SubagentStop'].length === 0) delete hooks['SubagentStop'];
  }

  if (Object.keys(hooks).length > 0) {
    settings.hooks = hooks;
  } else {
    delete settings.hooks;
  }
  writeSettings(projectDir, settings);
}
