/**
 * CLI argument parsing
 */

import type { ParsedArgs } from './types.js';

/**
 * Parses command line arguments to extract skill-router options.
 *
 * Supported flags:
 * - --agent=<name>: Run in agent mode for SubagentStart hook
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

    // Handle --agent <name> format (check if next arg is the value)
    // Note: This is handled by checking the previous iteration
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
