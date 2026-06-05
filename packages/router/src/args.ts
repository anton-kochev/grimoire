/**
 * CLI argument parsing
 */

import type { ParsedArgs } from './types.js';

/**
 * Parses command line arguments to extract router options.
 *
 * Supported flags:
 * - --enforce: Run PreToolUse enforcement check
 * - --subagent-start: Register session as a subagent (SubagentStart hook)
 * - --subagent-stop: Remove session from subagent registry (SubagentStop hook)
 *
 * The legacy --agent flag (used for hook-based skill injection) is ignored —
 * skill injection is handled natively by Claude Code via the `skills:` field
 * in agent frontmatter.
 *
 * @param argv - The process.argv array (or similar)
 * @returns Parsed arguments object
 */
export function parseArgs(argv: string[]): ParsedArgs {
  const result: ParsedArgs = {};

  for (const arg of argv) {
    if (arg === '--enforce') result.enforce = true;
    if (arg === '--subagent-start') result.subagentStart = true;
    if (arg === '--subagent-stop') result.subagentStop = true;
  }

  return result;
}
