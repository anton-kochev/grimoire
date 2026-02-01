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
 * Configuration for a specific agent type
 */
export interface AgentConfig {
  /** Skills the agent MUST activate (mandatory) */
  always_skills: string[];
  /** Skills available to the agent based on task content (optional) */
  compatible_skills: string[];
}

/**
 * Map of agent names to their configurations
 */
export type AgentsMap = Record<string, AgentConfig>;

/**
 * Complete skill manifest structure
 */
export interface SkillManifest {
  version: string;
  config: SkillConfig;
  skills: SkillDefinition[];
  /** Optional agent configurations for SubagentStart hook */
  agents?: AgentsMap;
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
 * Supported hook event types
 */
export type HookEventName = 'UserPromptSubmit' | 'SubagentStart';

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
export type LogOutcome = 'activated' | 'no_match' | 'error';

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
