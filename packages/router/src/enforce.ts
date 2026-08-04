/**
 * Agent enforcement logic for PreToolUse blocking.
 *
 * Ownership is decided statelessly from the PreToolUse payload: Claude Code
 * supplies `agent_type` (the editing agent's name) when an edit originates
 * inside a subagent, and omits it for the main thread. A specialist may edit
 * only the files it owns; anyone else is blocked from owned files.
 */

import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import picomatch from 'picomatch';
import type { EnforceDebugInfo, EnforceResult, PreToolUseInput, SubagentHookInput, SubagentLogEntry } from './types.js';
import { archiveSubagentRun, extractActivatedSkills, locateSubagentTranscript, resolveAgentType } from './archive.js';
import { buildApproachFeedback, buildApproachMandate, buildOwnershipNotice, evaluateApproachCheck, loadAgentApproaches } from './approaches.js';
import { bashCandidatePaths } from './bash-guard.js';
import { loadManifest } from './manifest.js';
import { loadGrimoireConfig } from './grimoire-config.js';
import { writeLog } from './logging.js';

/** Normalize Windows backslashes to forward slashes for consistent glob matching. */
function normalizeSeparators(p: string): string {
  return p.replaceAll('\\', '/');
}

/** Tools whose write target is a plain `file_path`. */
const FILE_PATH_TOOLS = ['Edit', 'Write', 'MultiEdit'];

/** Max command text kept in the log — shell commands can carry secrets. */
const COMMAND_EXCERPT_LIMIT = 200;

/**
 * Agents owning `candidate`, matched against the four path representations
 * Claude supplies edits in: absolute, basename, raw-as-given, project-relative.
 */
function matchOwners(
  candidate: string,
  enforced: ReadonlyArray<readonly [string, { file_patterns?: string[] }]>,
  projectDir: string,
): { agents: string[]; patternsChecked: string[]; relativePath: string; normalizedPath: string } {
  const normalizedPath = normalizeSeparators(candidate);
  const base = basename(normalizedPath);
  // normalizeSeparators() has already run — regex safely assumes forward slashes
  const isAbsolute = normalizedPath.startsWith('/') || /^[a-zA-Z]:\//.test(normalizedPath);
  const absPath = isAbsolute ? normalizedPath : normalizeSeparators(join(process.cwd(), normalizedPath));

  const normalizedProjectDir = normalizeSeparators(projectDir);
  const relativePath = absPath.startsWith(normalizedProjectDir + '/')
    ? absPath.slice(normalizedProjectDir.length + 1)
    : absPath;

  const agents: string[] = [];
  const patternsChecked: string[] = [];
  for (const [agentName, entry] of enforced) {
    const patterns = entry.file_patterns ?? [];
    patternsChecked.push(...patterns);
    const matches = patterns.some((pattern) => {
      const isMatch = picomatch(pattern);
      return isMatch(absPath) || isMatch(base) || isMatch(normalizedPath) || isMatch(relativePath);
    });
    if (matches) agents.push(agentName);
  }

  return { agents, patternsChecked, relativePath, normalizedPath };
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
  // Only block tools that can write files
  const isBash = input.tool_name === 'Bash';
  if (!FILE_PATH_TOOLS.includes(input.tool_name) && input.tool_name !== 'NotebookEdit' && !isBash) {
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

  const resolvedProjectDir = projectDir ?? process.cwd();

  // Resolve the candidate write targets from tool input. Bash carries them
  // inside a shell command rather than a path field, so it yields many.
  const rawCommand =
    isBash && typeof input.tool_input['command'] === 'string' ? input.tool_input['command'] : '';
  const candidates = isBash
    ? bashCandidatePaths(rawCommand)
    : [
        typeof input.tool_input['file_path'] === 'string'
          ? input.tool_input['file_path']
          : typeof input.tool_input['notebook_path'] === 'string'
            ? input.tool_input['notebook_path']
            : '',
      ].filter((p) => p !== '');

  if (candidates.length === 0) return { action: 'allow' };

  // Owner bypass: the specialist that owns the file may write it. `agent_type`
  // is set only when the write originates inside a subagent; the main thread
  // (undefined) and any non-owner subagent fall through to a block.
  const allPatternsChecked: string[] = [];
  let lastMatch: ReturnType<typeof matchOwners> | null = null;

  for (const candidate of candidates) {
    const match = matchOwners(candidate, enforced, resolvedProjectDir);
    lastMatch = match;
    if (match.agents.length === 0) {
      allPatternsChecked.push(...match.patternsChecked);
      continue;
    }
    if (input.agent_type && match.agents.includes(input.agent_type)) continue;

    return {
      action: 'block',
      agents: match.agents,
      filePath: match.normalizedPath,
      ...(isBash
        ? { via: 'bash' as const, commandExcerpt: excerptCommand(rawCommand) }
        : {}),
    };
  }

  // Every candidate was either unowned or owned by the caller.
  if (input.agent_type && lastMatch && lastMatch.agents.includes(input.agent_type)) {
    return { action: 'allow', ownerAgent: input.agent_type };
  }

  const debugInfo: EnforceDebugInfo = {
    rawFilePath: isBash ? excerptCommand(rawCommand) : (candidates[0] ?? ''),
    normalizedPath: lastMatch?.normalizedPath ?? '',
    relativePath: lastMatch?.relativePath ?? '',
    patternsChecked: allPatternsChecked,
  };
  return { action: 'allow', debugInfo };
}

/** Truncates command text for logging — never log a full shell command. */
function excerptCommand(command: string): string {
  return command.length > COMMAND_EXCERPT_LIMIT
    ? `${command.slice(0, COMMAND_EXCERPT_LIMIT)}…`
    : command;
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
      // Bash owner-bypasses have no single path field — fall back to the tool name.
      file_basename:
        typeof input.tool_input['file_path'] === 'string'
          ? basename(input.tool_input['file_path'])
          : typeof input.tool_input['notebook_path'] === 'string'
            ? basename(input.tool_input['notebook_path'])
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
      ...(result.via
        ? {
            via: result.via,
            matched_token: result.filePath,
            command_excerpt: result.commandExcerpt ?? '',
          }
        : {}),
    }, logPath);

    const agentList = result.agents.join(', ');
    const reason = [
      `This file is owned by: ${agentList}`,
      // Say this plainly for shell writes, or the agent just tries the next trick.
      ...(result.via === 'bash'
        ? [
            `Shell commands that write to owned files are blocked by the same rule as`,
            `Edit/Write — this is a routing decision, not an obstacle to work around.`,
          ]
        : []),
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
  extra: Pick<
    SubagentLogEntry,
    'archived' | 'skills_activated' | 'approaches_enforced' | 'approach_check' | 'approach_violations'
  > = {},
): void {
  if (input.agent_type && !hasLocalAgentDef(input.agent_type)) return;
  const entry: SubagentLogEntry = {
    timestamp: new Date().toISOString(),
    hook_event: hookEvent,
    session_id: input.session_id,
    agent_id: input.agent_id ?? null,
    agent_type: input.agent_type ?? null,
    ...(hookEvent === 'SubagentStop' ? { stop_reason: input.stop_reason ?? null } : {}),
    ...extra,
  };
  writeLog(entry, logPath);
}

/**
 * Emits telemetry when a subagent is spawned (SubagentStart hook), and injects
 * the enforced-approach mandate as additionalContext when the agent has
 * approaches configured in grimoire.json — the sub-agent sees it before its
 * first prompt. Approaches being configured is the opt-in; no approaches means
 * exactly the old telemetry-only behavior.
 */
export function runSubagentStart(input: SubagentHookInput, logPath = '.claude/logs/grimoire-router.log'): void {
  const projectDir = process.env['CLAUDE_PROJECT_DIR'] ?? process.cwd();
  const approaches = input.agent_type ? loadAgentApproaches(projectDir, input.agent_type) : [];

  logSubagentEvent(
    'SubagentStart',
    input,
    logPath,
    approaches.length > 0 ? { approaches_enforced: approaches.map((a) => a.name) } : {},
  );

  // Context is composed from two independent sources: the ownership notice
  // (whenever enforcement is actually in force) and the approach mandate.
  // Either alone is enough to emit — agents with no approaches still get the
  // ownership rules.
  const blocks: string[] = [];
  if (isEnforcementActive(projectDir)) blocks.push(buildOwnershipNotice());
  if (approaches.length > 0) blocks.push(buildApproachMandate(input.agent_type!, approaches));

  if (blocks.length > 0) {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'SubagentStart',
        additionalContext: blocks.join('\n\n'),
      },
    }));
  }
  process.exit(0);
}

/**
 * True when enforcement is enabled AND some agent actually declares
 * `file_patterns` — without patterns nothing is owned, so the notice would be
 * noise.
 */
function isEnforcementActive(projectDir: string): boolean {
  const config = loadGrimoireConfig(projectDir);
  if (config.enforcement !== true) return false;
  const agents = config.router?.agents;
  if (!agents) return false;
  return Object.values(agents).some(
    (entry) => Array.isArray(entry.file_patterns) && entry.file_patterns.length > 0,
  );
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

  // Point-in-time snapshot: Claude Code may still be flushing the transcript at
  // SubagentStop. Agent Insights later merges live+archive and is authoritative.
  let transcriptText: string | null = null;
  try {
    const source = locateSubagentTranscript(enriched);
    if (source) transcriptText = readFileSync(source.jsonl, 'utf-8');
  } catch {
    // Fail silent, like archiving/logging.
  }

  const skillsActivated = transcriptText !== null ? extractActivatedSkills(transcriptText) : undefined;

  // Adherence check for enforced approaches: an editing run that never invoked
  // a bound skill is bounced back once via additionalContext (the feedback's
  // marker in the transcript caps it at one bounce per run).
  const approaches = loadAgentApproaches(projectDir, agentType);
  const check = approaches.length > 0
    ? evaluateApproachCheck(approaches, transcriptText, input.stop_reason)
    : null;

  const archived = archiveSubagentRun(enriched, projectDir);
  logSubagentEvent('SubagentStop', enriched, logPath, {
    archived,
    ...(skillsActivated ? { skills_activated: skillsActivated } : {}),
    ...(check ? { approach_check: check.outcome } : {}),
    ...(check?.outcome === 'bounced'
      ? { approach_violations: check.violated.map((v) => v.name) }
      : {}),
  });

  if (check?.outcome === 'bounced') {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'SubagentStop',
        additionalContext: buildApproachFeedback(check.violated),
      },
    }));
  }
  process.exit(0);
}
