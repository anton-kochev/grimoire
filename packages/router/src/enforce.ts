/**
 * Agent enforcement logic for PreToolUse blocking and subagent session registry.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { basename, dirname, join } from 'node:path';
import picomatch from 'picomatch';
import type { EnforceDebugInfo, EnforceResult, PreToolUseInput, SubagentHookInput } from './types.js';

/** Normalize Windows backslashes to forward slashes for consistent glob matching. */
function normalizeSeparators(p: string): string {
  return p.replaceAll('\\', '/');
}
import { loadManifest } from './manifest.js';
import { loadGrimoireConfig } from './grimoire-config.js';
import { writeLog } from './logging.js';
import { readSkillBody } from './skill-content.js';

const DEFAULT_REGISTRY_PATH = '.claude/hooks/.grimoire-subagents.json';

// =============================================================================
// Registry helpers
// =============================================================================

function readRegistry(registryPath: string): string[] {
  if (!existsSync(registryPath)) return [];
  try {
    const data = JSON.parse(readFileSync(registryPath, 'utf-8')) as unknown;
    if (data && typeof data === 'object' && 'sessions' in data && Array.isArray((data as { sessions: unknown }).sessions)) {
      return (data as { sessions: string[] }).sessions.filter((s) => typeof s === 'string');
    }
  } catch {
    // Ignore parse errors — treat as empty
  }
  return [];
}

function writeRegistry(registryPath: string, sessions: string[]): void {
  const dir = dirname(registryPath);
  mkdirSync(dir, { recursive: true });
  writeFileSync(registryPath, JSON.stringify({ sessions }, null, 2) + '\n');
}

// =============================================================================
// Core enforcement logic
// =============================================================================

/**
 * Pure, testable enforcement check.
 * Returns allow if the tool use should proceed, block with agent names if it should be denied.
 */
export function evaluateEnforce(
  input: PreToolUseInput,
  registryPath: string,
  projectDir?: string,
  /** Override for grimoire.json lookup directory (defaults to projectDir). */
  configDir?: string,
): EnforceResult {
  // Only block file-editing tools
  if (!['Edit', 'Write', 'MultiEdit'].includes(input.tool_name)) {
    return { action: 'allow' };
  }

  // Subagent bypass: specialist agents are allowed to edit their own files
  const sessions = readRegistry(registryPath);
  if (sessions.includes(input.session_id)) {
    return { action: 'allow' };
  }

  // Check global enforcement config
  const resolvedConfigDir = configDir ?? projectDir ?? process.cwd();
  const grimoireConfig = loadGrimoireConfig(resolvedConfigDir);
  if (grimoireConfig.enforcement !== true) {
    return { action: 'allow' };
  }

  // Load manifest from grimoire.json router key
  let manifest;
  try {
    manifest = loadManifest(resolvedConfigDir);
  } catch {
    // If manifest is missing or invalid, don't block
    return { action: 'allow' };
  }

  if (!manifest.agents) return { action: 'allow' };

  // Collect agents that have file_patterns
  const enforced = Object.entries(manifest.agents).filter(
    ([, entry]) =>
      Array.isArray(entry.file_patterns) &&
      entry.file_patterns.length > 0,
  );

  if (enforced.length === 0) return { action: 'allow' };

  // Resolve file path from tool input
  const rawFilePath =
    typeof input.tool_input['file_path'] === 'string' ? input.tool_input['file_path'] : '';

  if (!rawFilePath) return { action: 'allow' };

  // Normalize separators for cross-platform glob matching
  const filePath = normalizeSeparators(rawFilePath);
  const base = basename(filePath);
  // normalizeSeparators() has already run above — regex safely assumes forward slashes
  const isAbsolute = filePath.startsWith('/') || /^[a-zA-Z]:\//.test(filePath);
  const absPath = isAbsolute ? filePath : normalizeSeparators(join(process.cwd(), filePath));

  // Compute project-relative path for matching against relative patterns
  const normalizedProjectDir = normalizeSeparators(projectDir ?? process.cwd());
  const relativePath = absPath.startsWith(normalizedProjectDir + '/')
    ? absPath.slice(normalizedProjectDir.length + 1)
    : absPath;

  // Check each enforced agent's patterns against full path, basename, raw input, and relative path
  // Match against multiple representations — Claude provides paths in varied formats:
  // absolute OS path, project-relative path, basename only, or raw as given.
  const matchingAgents: string[] = [];
  const allPatternsChecked: string[] = [];
  for (const [agentName, entry] of enforced) {
    const patterns = entry.file_patterns ?? [];
    allPatternsChecked.push(...patterns);
    const matches = patterns.some((pattern) => {
      const isMatch = picomatch(pattern);
      return isMatch(absPath) || isMatch(base) || isMatch(filePath) || isMatch(relativePath);
    });
    if (matches) {
      matchingAgents.push(agentName);
    }
  }

  if (matchingAgents.length === 0) {
    const debugInfo: EnforceDebugInfo = {
      rawFilePath,
      normalizedPath: filePath,
      relativePath,
      patternsChecked: allPatternsChecked,
    };
    return { action: 'allow', debugInfo };
  }

  return { action: 'block', agents: matchingAgents, filePath };
}

/**
 * Entry point for --enforce flag (PreToolUse hook).
 * Calls evaluateEnforce, writes block message to stdout, and exits.
 */
export function runEnforce(input: PreToolUseInput, logPath = '.claude/logs/grimoire-router.log'): void {
  const projectDir = process.env['CLAUDE_PROJECT_DIR'] ?? process.cwd();
  const registryPath = join(projectDir, DEFAULT_REGISTRY_PATH);

  const result = evaluateEnforce(input, registryPath, projectDir);

  if (result.action === 'allow' && result.debugInfo) {
    writeLog({
      timestamp: new Date().toISOString(),
      session_id: input.session_id,
      hook_event: 'PreToolUse',
      tool_name: input.tool_name,
      outcome: 'allow',
      enforce_block: false,
      file_path: result.debugInfo.rawFilePath,
      normalized_path: result.debugInfo.normalizedPath,
      relative_path: result.debugInfo.relativePath,
      patterns_checked: result.debugInfo.patternsChecked,
    }, logPath);
  }

  if (result.action === 'block') {
    writeLog({
      timestamp: new Date().toISOString(),
      session_id: input.session_id,
      hook_event: 'PreToolUse',
      tool_name: input.tool_name,
      outcome: 'blocked',
      enforce_block: true,
      file_basename: basename(result.filePath),
      blocking_agents: result.agents,
    }, logPath);

    const agentList = result.agents.join(', ');
    const reason = [
      `This file is owned by: ${agentList}`,
      `Use the Task tool to delegate this work:`,
      `  subagent_type: "${result.agents[0]}"`,
    ].join('\n');

    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: reason,
      },
    }));
    process.exit(0);
  }

  process.exit(0);
}

// =============================================================================
// Agent skill resolution (frontmatter-based)
// =============================================================================

/**
 * Parses the `skills:` array from an agent .md file's YAML frontmatter.
 * SYNC: identical logic in packages/cli/src/frontmatter.ts — keep in sync.
 */
function parseAgentSkills(content: string): string[] {
  const fm = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fm?.[1]) return [];

  const lines = fm[1].split('\n');
  const skillsIdx = lines.findIndex((l) => /^skills:\s*$/.test(l));
  if (skillsIdx === -1) return [];

  const skills: string[] = [];
  for (let i = skillsIdx + 1; i < lines.length; i++) {
    const match = lines[i]!.match(/^\s+-\s+(.+)$/);
    if (!match) break;
    const name = match[1]!.trim();
    if (name) skills.push(name);
  }
  return skills;
}

/**
 * Resolves skill content for an agent by reading skills declared in its frontmatter.
 * Returns concatenated skill bodies with headers, or null if no skills resolve.
 */
export function resolveAgentSkills(agentName: string, projectDir: string): string | null {
  let content: string;
  try {
    content = readFileSync(join(projectDir, '.claude', 'agents', `${agentName}.md`), 'utf-8');
  } catch {
    return null;
  }

  const skillNames = parseAgentSkills(content);
  if (skillNames.length === 0) return null;

  const sections: string[] = [];
  for (const name of skillNames) {
    const body = readSkillBody(`.claude/skills/${name}`, projectDir);
    if (body) {
      sections.push(`# Skill: ${name}\n\n${body}`);
    }
  }

  return sections.length > 0 ? sections.join('\n\n---\n\n') : null;
}

// =============================================================================
// Subagent session registry
// =============================================================================

/**
 * Registers the current session as a subagent (SubagentStart hook).
 * Idempotent — will not add duplicate session IDs.
 */
export function runSubagentStart(input: SubagentHookInput, registryPath?: string): void {
  const projectDir = process.env['CLAUDE_PROJECT_DIR'] ?? process.cwd();
  const resolvedPath = registryPath ?? join(projectDir, DEFAULT_REGISTRY_PATH);

  const sessions = readRegistry(resolvedPath);
  if (!sessions.includes(input.session_id)) {
    sessions.push(input.session_id);
    writeRegistry(resolvedPath, sessions);
  }

  if (input.agent_name) {
    const context = resolveAgentSkills(input.agent_name, projectDir);
    if (context !== null) {
      process.stdout.write(JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'SubagentStart',
          additionalContext: context,
        },
      }));
    }
  }

  process.exit(0);
}

/**
 * Removes the current session from the subagent registry (SubagentStop hook).
 * No-op if the session ID or registry file is absent.
 */
export function runSubagentStop(input: SubagentHookInput, registryPath?: string): void {
  const projectDir = process.env['CLAUDE_PROJECT_DIR'] ?? process.cwd();
  const resolvedPath = registryPath ?? join(projectDir, DEFAULT_REGISTRY_PATH);

  const sessions = readRegistry(resolvedPath);
  const updated = sessions.filter((s) => s !== input.session_id);

  if (updated.length !== sessions.length) {
    writeRegistry(resolvedPath, updated);
  }

  process.exit(0);
}
