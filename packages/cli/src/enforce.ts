/**
 * Utilities for the `grimoire enforce-agent` command.
 * Manages the enforce flag per agent and the corresponding hook entries in settings.json.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

// =============================================================================
// Manifest types (local, minimal — parallel to setup.ts)
// =============================================================================

export interface ManifestAgentEntry {
  file_patterns?: string[];
  enforce?: boolean;
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
  const manifestPath = join(projectDir, '.claude', 'skills-manifest.json');
  if (!existsSync(manifestPath)) {
    throw new Error(`Manifest not found: ${manifestPath}`);
  }
  return JSON.parse(readFileSync(manifestPath, 'utf-8')) as SkillsManifest;
}

export function writeManifest(projectDir: string, manifest: SkillsManifest): void {
  const manifestPath = join(projectDir, '.claude', 'skills-manifest.json');
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
}

/**
 * Sets the enforce flag for a named agent in the manifest.
 * Throws if the agent has no file_patterns (cannot be enforced without them).
 */
export function setEnforce(manifest: SkillsManifest, agentName: string, enabled: boolean): void {
  const entry = manifest.agents[agentName];
  if (!entry) {
    throw new Error(`Agent "${agentName}" not found in manifest`);
  }
  if (enabled && (!entry.file_patterns || entry.file_patterns.length === 0)) {
    throw new Error(`Agent "${agentName}" has no file_patterns — cannot enable enforcement`);
  }
  manifest.agents[agentName] = { ...entry, enforce: enabled };
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
const SUBAGENT_START_COMMAND = 'npx @grimoire-cc/router --subagent-start';
const SUBAGENT_STOP_COMMAND = 'npx @grimoire-cc/router --subagent-stop';

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
 * Returns true if a SubagentStart entry for the given agent already exists.
 */
export function hasSubagentHook(
  entries: readonly HookEntry[],
  agentName: string,
  flag: '--subagent-start' | '--subagent-stop',
): boolean {
  return entries.some(
    (e) => e.matcher === agentName && e.hooks.some((h) => h.command.includes(flag)),
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

  // Per-agent SubagentStart/Stop hooks
  if (!hooks['SubagentStart']) hooks['SubagentStart'] = [];
  if (!hooks['SubagentStop']) hooks['SubagentStop'] = [];

  for (const agentName of agentNames) {
    if (!hasSubagentHook(hooks['SubagentStart']!, agentName, '--subagent-start')) {
      hooks['SubagentStart']!.push({
        matcher: agentName,
        hooks: [{ type: 'command', command: SUBAGENT_START_COMMAND }],
      });
    }
    if (!hasSubagentHook(hooks['SubagentStop']!, agentName, '--subagent-stop')) {
      hooks['SubagentStop']!.push({
        matcher: agentName,
        hooks: [{ type: 'command', command: SUBAGENT_STOP_COMMAND }],
      });
    }
  }

  settings.hooks = hooks;
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
