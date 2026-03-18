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
// Paired skill resolution
// =============================================================================

/**
 * Resolves the paired skill context for a given agent.
 * Convention: agent `grimoire.csharp-coder` → skill dir `grimoire.csharp-coder-skill`.
 * Returns skill body if found, or a warning message to relay to the user if not.
 */
function resolveAgentSkillContext(agentName: string, projectDir: string): string {
  const skillPath = `.claude/skills/${agentName}-skill`;
  const body = readSkillBody(skillPath, projectDir);
  if (body) return body;

  return [
    `⚠ No paired skill found for agent "${agentName}".`,
    `Expected: ${join(projectDir, skillPath, 'SKILL.md')}`,
    `Please inform the user that the paired skill is missing and ask whether to continue without it.`,
  ].join('\n');
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
  manifestPath: string,
  registryPath: string,
  projectDir?: string,
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

  // Load manifest
  let manifest;
  try {
    manifest = loadManifest(manifestPath);
  } catch {
    // If manifest is missing or invalid, don't block
    return { action: 'allow' };
  }

  if (!manifest.agents) return { action: 'allow' };

  // Collect enforced agents that have file_patterns
  const enforced = Object.entries(manifest.agents).filter(
    ([, entry]) =>
      entry.enforce === true &&
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
  const manifestPath = join(projectDir, '.claude', 'skills-manifest.json');
  const registryPath = join(projectDir, DEFAULT_REGISTRY_PATH);

  const result = evaluateEnforce(input, manifestPath, registryPath, projectDir);

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
    const context = resolveAgentSkillContext(input.agent_name, projectDir);
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'SubagentStart',
        additionalContext: context,
      },
    }));
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
