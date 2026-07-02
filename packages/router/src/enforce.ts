/**
 * Agent enforcement logic for PreToolUse blocking.
 *
 * Ownership is decided statelessly from the PreToolUse payload: Claude Code
 * supplies `agent_type` (the editing agent's name) when an edit originates
 * inside a subagent, and omits it for the main thread. A specialist may edit
 * only the files it owns; anyone else is blocked from owned files.
 */

import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import picomatch from 'picomatch';
import type { EnforceDebugInfo, EnforceResult, PreToolUseInput, SubagentHookInput } from './types.js';
import { archiveSubagentRun, resolveAgentType } from './archive.js';
import { loadManifest } from './manifest.js';
import { loadGrimoireConfig } from './grimoire-config.js';
import { writeLog } from './logging.js';

/** Normalize Windows backslashes to forward slashes for consistent glob matching. */
function normalizeSeparators(p: string): string {
  return p.replaceAll('\\', '/');
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
  projectDir?: string,
  /** Override for grimoire.json lookup directory (defaults to projectDir). */
  configDir?: string,
): EnforceResult {
  // Only block file-editing tools
  if (!['Edit', 'Write', 'MultiEdit'].includes(input.tool_name)) {
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

  // Owner bypass: the specialist that owns the file may edit it. `agent_type`
  // is set only when the edit originates inside a subagent; the main thread
  // (undefined) and any non-owner subagent fall through to a block.
  if (input.agent_type && matchingAgents.includes(input.agent_type)) {
    return { action: 'allow', ownerAgent: input.agent_type };
  }

  return { action: 'block', agents: matchingAgents, filePath };
}

/**
 * Entry point for --enforce flag (PreToolUse hook).
 * Calls evaluateEnforce, writes block message to stdout, and exits.
 */
export function runEnforce(input: PreToolUseInput, logPath = '.claude/logs/grimoire-router.log'): void {
  const projectDir = process.env['CLAUDE_PROJECT_DIR'] ?? process.cwd();

  const result = evaluateEnforce(input, projectDir);

  // Passthrough allows (edits to non-owned files) are debug telemetry for tuning
  // file_patterns — noisy and unused downstream, so opt-in via verboseEnforcementLog.
  if (result.action === 'allow' && result.debugInfo && loadGrimoireConfig(projectDir).verboseEnforcementLog === true) {
    writeLog({
      timestamp: new Date().toISOString(),
      session_id: input.session_id,
      agent_id: input.agent_id ?? null,
      agent_type: input.agent_type ?? null,
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

  if (result.action === 'allow' && result.ownerAgent) {
    writeLog({
      timestamp: new Date().toISOString(),
      session_id: input.session_id,
      agent_id: input.agent_id ?? null,
      agent_type: input.agent_type ?? null,
      hook_event: 'PreToolUse',
      tool_name: input.tool_name,
      outcome: 'allow',
      enforce_block: false,
      owner_bypass: true,
      file_basename:
        typeof input.tool_input['file_path'] === 'string'
          ? basename(input.tool_input['file_path'])
          : '',
    }, logPath);
  }

  if (result.action === 'block') {
    writeLog({
      timestamp: new Date().toISOString(),
      session_id: input.session_id,
      agent_id: input.agent_id ?? null,
      agent_type: input.agent_type ?? null,
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
// Subagent telemetry
// =============================================================================
//
// Enforcement no longer keeps a session registry — ownership is resolved
// statelessly in evaluateEnforce from the PreToolUse `agent_type`. These hooks
// remain wired up purely to emit lifecycle telemetry, and only for agents with
// an editable local definition: Claude Code's built-in agents (Explore, Plan,
// general-purpose, …) have none, so their lifecycle is not worth recording.

/**
 * Whether the agent type has an editable definition file (project or user level).
 */
function hasLocalAgentDef(agentType: string): boolean {
  const projectDir = process.env['CLAUDE_PROJECT_DIR'] ?? process.cwd();
  return (
    existsSync(join(projectDir, '.claude', 'agents', `${agentType}.md`)) ||
    existsSync(join(homedir(), '.claude', 'agents', `${agentType}.md`))
  );
}

/**
 * Logs a subagent lifecycle event (SubagentStart / SubagentStop hooks).
 * Skips built-in agents; a missing `agent_type` is still logged (can't classify).
 */
function logSubagentEvent(
  hookEvent: 'SubagentStart' | 'SubagentStop',
  input: SubagentHookInput,
  logPath: string,
  extra: Record<string, unknown> = {},
): void {
  if (input.agent_type && !hasLocalAgentDef(input.agent_type)) return;
  writeLog({
    timestamp: new Date().toISOString(),
    hook_event: hookEvent,
    session_id: input.session_id,
    agent_id: input.agent_id ?? null,
    agent_type: input.agent_type ?? null,
    ...(hookEvent === 'SubagentStop' ? { stop_reason: input.stop_reason ?? null } : {}),
    ...extra,
  }, logPath);
}

/**
 * Emits telemetry when a subagent is spawned (SubagentStart hook).
 */
export function runSubagentStart(input: SubagentHookInput, logPath = '.claude/logs/grimoire-router.log'): void {
  logSubagentEvent('SubagentStart', input, logPath);
  process.exit(0);
}

/**
 * Archives the finished subagent's transcript and emits telemetry
 * (SubagentStop hook).
 *
 * The stop payload omits `agent_type`, so the real type is recovered from the
 * sub-agent's meta.json (via `resolveAgentType`). A `cwd` is synthesized from
 * the project dir when the payload lacks one so the transcript can still be
 * located. Only agents with an editable local definition are tracked: built-ins
 * (Plan, Explore, general-purpose) and stops we can't attribute are skipped for
 * both archiving and telemetry — this is what kept the log free of empty
 * `agent_type` rows.
 */
export function runSubagentStop(input: SubagentHookInput, logPath = '.claude/logs/grimoire-router.log'): void {
  const projectDir = process.env['CLAUDE_PROJECT_DIR'] ?? process.cwd();
  const located: SubagentHookInput = { ...input, cwd: input.cwd ?? projectDir };

  const agentType = resolveAgentType(located);
  if (!agentType || !hasLocalAgentDef(agentType)) {
    process.exit(0);
  }

  const enriched: SubagentHookInput = { ...located, agent_type: agentType };
  const archived = archiveSubagentRun(enriched, projectDir);
  logSubagentEvent('SubagentStop', enriched, logPath, { archived });
  process.exit(0);
}
