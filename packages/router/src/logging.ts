/**
 * Logging functions
 */

import { appendFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import type {
  LogEntry,
  LogOutcome,
  ExtractedSignals,
  SkillScoreResult,
  MatchedSkillLogEntry,
} from './types.js';

const MAX_PROMPT_LENGTH = 500;

interface BuildLogEntryParams {
  sessionId: string;
  promptRaw: string;
  promptNormalized: string;
  signals: ExtractedSignals;
  skillsEvaluated: number;
  matchedSkills: SkillScoreResult[];
  threshold: number;
  startTime: number;
  outcome: LogOutcome;
}

/**
 * Builds a structured log entry.
 */
export function buildLogEntry(params: BuildLogEntryParams): LogEntry {
  const executionTimeMs = Date.now() - params.startTime;

  // Truncate raw prompt if too long
  const promptRaw =
    params.promptRaw.length > MAX_PROMPT_LENGTH
      ? params.promptRaw.slice(0, MAX_PROMPT_LENGTH)
      : params.promptRaw;

  // Convert matched skills to log format
  const skillsMatched: MatchedSkillLogEntry[] = params.matchedSkills.map(
    (result) => ({
      name: result.skill.name,
      path: result.skill.path,
      score: result.score,
      matched_signals: result.matchedSignals,
    })
  );

  return {
    timestamp: new Date().toISOString(),
    session_id: params.sessionId,
    prompt_raw: promptRaw,
    prompt_normalized: params.promptNormalized,
    signals_extracted: {
      words_count: params.signals.words.size,
      extensions: Array.from(params.signals.extensions),
      paths: params.signals.paths,
    },
    skills_evaluated: params.skillsEvaluated,
    skills_matched: skillsMatched,
    threshold: params.threshold,
    execution_time_ms: executionTimeMs,
    outcome: params.outcome,
  };
}

/**
 * Writes a log entry to the specified file.
 * Creates directory and file if they don't exist.
 * Silently fails on write errors (non-blocking).
 */
export function writeLog(entry: unknown, logPath: string): void {
  try {
    // Ensure directory exists
    mkdirSync(dirname(logPath), { recursive: true });

    // Append JSON line
    const line = JSON.stringify(entry) + '\n';
    appendFileSync(logPath, line, 'utf-8');
  } catch {
    // Silently ignore — never block user or produce stderr output
    // (Claude Code treats any stderr from hooks as a hook error)
  }
}
