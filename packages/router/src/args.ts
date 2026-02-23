/**
 * CLI argument parsing
 */

import type { ParsedArgs } from './types.js';

/**
 * Parses command line arguments to extract router options.
 *
 * Supported flags:
 * - --agent=<name>: Run in agent mode for SubagentStart hook
 * - --enforce: Run PreToolUse enforcement check
 * - --subagent-start: Register session as a subagent (SubagentStart hook)
 * - --subagent-stop: Remove session from subagent registry (SubagentStop hook)
 *
 * @param argv - The process.argv array (or similar)
 * @returns Parsed arguments object
 */
export function parseArgs(argv: string[]): ParsedArgs {
  const result: ParsedArgs = {};

  for (const arg of argv) {
    // Handle --agent=<name> format
    if (arg.startsWith('--agent=')) {
      const value = arg.slice('--agent='.length);
      if (value) {
        result.agent = value;
      }
    }

    if (arg === '--enforce') result.enforce = true;
    if (arg === '--subagent-start') result.subagentStart = true;
    if (arg === '--subagent-stop') result.subagentStop = true;
  }

  // Handle --agent <name> format (space-separated)
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--agent' && i + 1 < argv.length) {
      const nextArg = argv[i + 1];
      // Only use as value if it doesn't start with --
      if (nextArg && !nextArg.startsWith('--')) {
        result.agent = nextArg;
      }
    }
  }

  return result;
}
