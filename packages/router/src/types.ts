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
 * Per-agent entry in the manifest (file_patterns and enforce flag)
 */
export interface AgentEntry {
  file_patterns?: string[];
  enforce?: boolean;
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
}

/**
 * Supported hook event types
 */
export type HookEventName = 'UserPromptSubmit' | 'SubagentStart' | 'PreToolUse';

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
  /** Agent name if --agent flag is provided */
  agent?: string;
  /** Run enforcement check (PreToolUse) */
  enforce?: boolean;
  /** Register session as a subagent (SubagentStart) */
  subagentStart?: boolean;
  /** Remove session from subagent registry (SubagentStop) */
  subagentStop?: boolean;
}

/**
 * Result of evaluateEnforce — either allow or block with matching agent names
 */
export type EnforceResult =
  | { action: 'allow' }
  | { action: 'block'; agents: string[]; filePath: string };

/**
 * Minimal input for SubagentStart/Stop hooks (only session_id needed)
 */
export interface SubagentHookInput {
  session_id: string;
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
