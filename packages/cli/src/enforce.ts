/**
 * Utilities for agent enforcement.
 * Manages enforcement hook entries in settings.local.json and reads the skills manifest.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

// Hook registration is written to the local (gitignored) settings file so it
// stays out of the user's committed repo.
const SETTINGS_FILE = 'settings.local.json';

// =============================================================================
// Manifest types (local, minimal — parallel to setup.ts)
// =============================================================================

// SYNC: keep in sync with ApproachEntry in packages/router/src/types.ts
export interface ManifestApproachEntry {
  name: string;
  directive: string;
  /** Optional backing skill (directory name under .claude/skills). */
  skill?: string;
}

export interface ManifestAgentEntry {
  file_patterns?: string[];
  approaches?: ManifestApproachEntry[];
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

/** Names of agents with at least one enforcement file pattern. */
export function agentsWithPatterns(manifest: SkillsManifest): string[] {
  return Object.entries(manifest.agents ?? {})
    .filter(([, entry]) => Array.isArray(entry.file_patterns) && entry.file_patterns.length > 0)
    .map(([name]) => name);
}

/** True when a raw approach entry has the non-empty name+directive the router enforces. */
function isEnforceableApproach(approach: ManifestApproachEntry | undefined): boolean {
  return (
    typeof approach?.name === 'string' && approach.name.trim() !== '' &&
    typeof approach?.directive === 'string' && approach.directive.trim() !== ''
  );
}

/** Names of agents with at least one approach the router would actually enforce. */
export function agentsWithApproaches(manifest: SkillsManifest): string[] {
  return Object.entries(manifest.agents ?? {})
    .filter(([, entry]) => Array.isArray(entry.approaches) && entry.approaches.some(isEnforceableApproach))
    .map(([name]) => name);
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

// Subagent hooks emit lifecycle telemetry only. Enforcement decides ownership
// statelessly from the PreToolUse `agent_type` field, so these hooks no longer
// gate edits. Skill injection is handled natively by Claude Code via the
// `skills:` field in agent frontmatter, so no --agent= flag is needed.
const SUBAGENT_START_COMMAND = 'npx @grimoire-cc/router --subagent-start';
const SUBAGENT_STOP_COMMAND = 'npx @grimoire-cc/router --subagent-stop';

function readSettings(projectDir: string): ClaudeSettings {
  const path = join(projectDir, '.claude', SETTINGS_FILE);
  if (!existsSync(path)) return {};
  return JSON.parse(readFileSync(path, 'utf-8')) as ClaudeSettings;
}

function writeSettings(projectDir: string, settings: ClaudeSettings): void {
  const claudeDir = join(projectDir, '.claude');
  mkdirSync(claudeDir, { recursive: true });
  writeFileSync(join(claudeDir, SETTINGS_FILE), JSON.stringify(settings, null, 2) + '\n');
}

/**
 * Returns true if a PreToolUse entry with --enforce already exists.
 */
export function hasEnforcePreToolUseHook(entries: readonly HookEntry[]): boolean {
  return entries.some((e) => e.hooks.some((h) => h.command.includes('--enforce')));
}

/**
 * Returns true if a current-format SubagentStart/Stop entry already exists
 * (per-agent matcher, no legacy --agent= flag).
 */
export function hasSubagentHook(
  entries: readonly HookEntry[],
  agentName: string,
  flag: '--subagent-start' | '--subagent-stop',
): boolean {
  return entries.some(
    (e) =>
      e.matcher === agentName &&
      e.hooks.some((h) => h.command.includes(flag) && !h.command.includes('--agent=')),
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

  settings.hooks = hooks;
  writeSettings(projectDir, settings);

  ensureSubagentHooks(projectDir, agentNames);
}

/**
 * Idempotently adds per-agent SubagentStart/Stop hook entries (and migrates
 * legacy formats) WITHOUT touching PreToolUse. Used on its own for agents
 * whose only hook need is approach injection/verification — approaches are
 * independent of the enforcement toggle.
 */
export function ensureSubagentHooks(projectDir: string, agentNames: readonly string[]): void {
  const settings = readSettings(projectDir);
  const hooks = (settings.hooks ?? {}) as Record<string, HookEntry[]>;

  // Migrate legacy hook formats:
  // - injection format with --agent=<name> (skill injection is native now)
  // - combined pipe-matcher entries (one entry per agent is the current format)
  const isLegacySubagentEntry = (e: HookEntry, flag: string): boolean =>
    e.hooks.some((h) => h.command.includes(flag)) &&
    (e.hooks.some((h) => h.command.includes('--agent=')) || e.matcher.includes('|'));

  if (hooks['SubagentStart']) {
    hooks['SubagentStart'] = hooks['SubagentStart'].filter(
      (e) => !isLegacySubagentEntry(e, '--subagent-start'),
    );
  }
  if (hooks['SubagentStop']) {
    hooks['SubagentStop'] = hooks['SubagentStop'].filter(
      (e) => !isLegacySubagentEntry(e, '--subagent-stop'),
    );
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
 * Removes SubagentStart/Stop hook entries for a specific agent.
 * Leaves all other hooks (PreToolUse, other agents) intact.
 * No-op if the file or hooks don't exist.
 */
export function removeSubagentHooksFor(projectDir: string, agentName: string): void {
  const settings = readSettings(projectDir);
  if (!settings.hooks) return;

  const hooks = settings.hooks as Record<string, HookEntry[]>;

  // Format-agnostic: removes both current entries and legacy --agent= entries
  if (hooks['SubagentStart']) {
    hooks['SubagentStart'] = hooks['SubagentStart'].filter(
      (e) =>
        !(
          e.matcher === agentName &&
          e.hooks.some((h) => h.command.includes('--subagent-start'))
        ),
    );
    if (hooks['SubagentStart'].length === 0) delete hooks['SubagentStart'];
  }

  if (hooks['SubagentStop']) {
    hooks['SubagentStop'] = hooks['SubagentStop'].filter(
      (e) =>
        !(
          e.matcher === agentName &&
          e.hooks.some((h) => h.command.includes('--subagent-stop'))
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
 * Removes all enforcement-related hook entries from settings.local.json.
 * SubagentStart/Stop entries whose matcher is in `spareSubagentAgents` are
 * kept — approach-driven hooks survive the enforcement toggle, which governs
 * only file-ownership blocking.
 * No-op if the file or hooks don't exist.
 */
export function removeEnforceHooks(
  projectDir: string,
  spareSubagentAgents: readonly string[] = [],
): void {
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
      (e) =>
        spareSubagentAgents.includes(e.matcher) ||
        !e.hooks.some((h) => h.command.includes('--subagent-start')),
    );
    if (hooks['SubagentStart'].length === 0) delete hooks['SubagentStart'];
  }

  if (hooks['SubagentStop']) {
    hooks['SubagentStop'] = hooks['SubagentStop'].filter(
      (e) =>
        spareSubagentAgents.includes(e.matcher) ||
        !e.hooks.some((h) => h.command.includes('--subagent-stop')),
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
