/**
 * Type definitions for the Skill Router
 */

// =============================================================================
// Skill Manifest Schema
// =============================================================================

/**
 * Scoring weights for each signal type
 */
export interface SkillWeights {
  keywords: number;
  file_extensions: number;
  patterns: number;
  file_paths: number;
}

/**
 * Global configuration settings
 */
export interface SkillConfig {
  weights: SkillWeights;
  activation_threshold: number;
  pretooluse_threshold?: number;
  log_path?: string;
}

/**
 * Trigger conditions for a skill
 */
export interface SkillTriggers {
  keywords?: string[];
  file_extensions?: string[];
  patterns?: string[];
  file_paths?: string[];
}

/**
 * A single skill definition in the manifest
 */
export interface SkillDefinition {
  path: string;
  name: string;
  description?: string;
  triggers: SkillTriggers;
}

/**
 * Per-agent entry in the manifest (file ownership patterns)
 */
export interface AgentEntry {
  file_patterns?: string[];
}

/**
 * Agent Insights settings (`insights` key in `.claude/grimoire.json`)
 */
export interface InsightsConfig {
  /** Archive sub-agent transcripts on SubagentStop (default true). */
  archive?: boolean;
  /** Sessions kept per agent type (default 20; 0 disables archiving). */
  retainRunsPerAgent?: number;
}

/**
 * Global Grimoire configuration (`.claude/grimoire.json`)
 */
export interface GrimoireConfig {
  enforcement?: boolean;
  /** Log allowed edits to non-owned files (passthrough telemetry for tuning file_patterns). Default false. */
  verboseEnforcementLog?: boolean;
  insights?: InsightsConfig;
  router?: SkillManifest;
}

/**
 * Complete skill manifest structure
 */
export interface SkillManifest {
  version: string;
  config: SkillConfig;
  skills: SkillDefinition[];
  /** Optional agent configurations */
  agents?: Record<string, AgentEntry>;
}

// =============================================================================
// Hook Input/Output Schema
// =============================================================================

/**
 * Input received from Claude Code hook system via stdin
 */
export interface HookInput {
  prompt: string;
  session_id: string;
  timestamp: string;
}

/**
 * Supported tool names for PreToolUse hook
 */
export type ToolName = 'Edit' | 'Write' | 'MultiEdit';

/**
 * Input received from PreToolUse hook via stdin
 */
export interface PreToolUseInput {
  session_id: string;
  hook_event_name: 'PreToolUse';
  tool_name: ToolName;
  tool_use_id: string;
  tool_input: Record<string, unknown>;
  /** Unique subagent invocation id — present only when the edit originates inside a subagent. */
  agent_id?: string;
  /** Editing agent's name (e.g. `grimoire.typescript-coder`) — present inside a subagent. */
  agent_type?: string;
}

/**
 * Supported hook event types
 */
export type HookEventName = 'UserPromptSubmit' | 'SubagentStart' | 'SubagentStop' | 'PreToolUse';

/**
 * Hook-specific output data
 */
export interface HookSpecificOutput {
  hookEventName: HookEventName;
  additionalContext: string;
}

/**
 * Output written to stdout when skills are matched
 */
export interface HookOutput {
  hookSpecificOutput: HookSpecificOutput;
}

/**
 * PreToolUse-specific output data (includes permissionDecision)
 */
export interface PreToolUseSpecificOutput {
  hookEventName: 'PreToolUse';
  additionalContext: string;
  permissionDecision: 'allow';
}

/**
 * Output for PreToolUse hook
 */
export interface PreToolUseOutput {
  hookSpecificOutput: PreToolUseSpecificOutput;
}

// =============================================================================
// Internal Data Structures
// =============================================================================

/**
 * Signals extracted from normalized prompt
 */
export interface ExtractedSignals {
  words: Set<string>;
  extensions: Set<string>;
  paths: string[];
}

/**
 * Type of matched signal
 */
export type MatchedSignalType = 'keyword' | 'extension' | 'pattern' | 'path';

/**
 * A single matched signal
 */
export interface MatchedSignal {
  type: MatchedSignalType;
  value: string;
  matchQuality?: 'exact' | 'stem' | 'fuzzy';
}

/**
 * Reference to a skill (minimal info for results)
 */
export interface SkillReference {
  path: string;
  name: string;
}

/**
 * Result of scoring a single skill
 */
export interface SkillScoreResult {
  skill: SkillReference;
  score: number;
  matchedSignals: MatchedSignal[];
}

/**
 * CLI arguments parsed from process.argv
 */
export interface ParsedArgs {
  /** Run enforcement check (PreToolUse) */
  enforce?: boolean;
  /** Emit subagent-spawned telemetry (SubagentStart) */
  subagentStart?: boolean;
  /** Emit subagent-finished telemetry (SubagentStop) */
  subagentStop?: boolean;
}

/**
 * Result of evaluateEnforce — either allow or block with matching agent names
 */
export interface EnforceDebugInfo {
  rawFilePath: string;
  normalizedPath: string;
  relativePath: string;
  patternsChecked: string[];
}

export type EnforceResult =
  | { action: 'allow'; debugInfo?: EnforceDebugInfo; ownerAgent?: string }
  | { action: 'block'; agents: string[]; filePath: string };

/**
 * Input for SubagentStart/Stop hooks — telemetry logging and transcript archiving.
 */
export interface SubagentHookInput {
  session_id: string;
  /** Unique subagent invocation id. */
  agent_id?: string;
  /** Subagent's name (e.g. `grimoire.typescript-coder`). */
  agent_type?: string;
  /** SubagentStop only: `success` | `cancelled` | `error`. */
  stop_reason?: string;
  /** Main session transcript path (`…/projects/<encoded-cwd>/<session_id>.jsonl`). */
  transcript_path?: string;
  /** Exact sub-agent transcript path, supplied directly by newer Claude Code. */
  agent_transcript_path?: string;
  /** Project working directory the session runs in. */
  cwd?: string;
}

// =============================================================================
// Log Entry Schema
// =============================================================================

/**
 * Summary of extracted signals for logging
 */
export interface SignalsExtractedSummary {
  words_count: number;
  extensions: string[];
  paths: string[];
}

/**
 * Matched skill info for logging
 */
export interface MatchedSkillLogEntry {
  name: string;
  path: string;
  score: number;
  matched_signals: MatchedSignal[];
}

/**
 * Outcome of skill router execution
 */
export type LogOutcome = 'activated' | 'no_match' | 'error' | 'blocked';

/**
 * Log entry for an agent enforcement block (PreToolUse)
 */
export interface EnforceBlockLogEntry {
  timestamp: string;
  session_id: string;
  hook_event: 'PreToolUse';
  tool_name: string;
  outcome: 'blocked';
  enforce_block: true;
  file_basename: string;
  blocking_agents: string[];
}

/**
 * Log entry for sub-agent lifecycle telemetry.
 */
export interface SubagentLogEntry {
  timestamp: string;
  hook_event: 'SubagentStart' | 'SubagentStop';
  session_id: string;
  agent_id: string | null;
  agent_type: string | null;
  stop_reason?: string | null;
  archived?: boolean;
  /** Runtime-invoked skills observed in the transcript at SubagentStop. */
  skills_activated?: string[];
}

/**
 * Complete log entry structure
 */
export interface LogEntry {
  timestamp: string;
  session_id: string;
  prompt_raw: string;
  prompt_normalized: string;
  signals_extracted: SignalsExtractedSummary;
  skills_evaluated: number;
  skills_matched: MatchedSkillLogEntry[];
  threshold: number;
  execution_time_ms: number;
  outcome: LogOutcome;
}

// =============================================================================
// Error Log Entry
// =============================================================================

/**
 * Log level for error entries
 */
export type LogLevel = 'error' | 'warning' | 'info';

/**
 * Error log entry structure
 */
export interface ErrorLogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  error_type: string;
  details: Record<string, unknown> | null;
  stack_trace: string | null;
}
