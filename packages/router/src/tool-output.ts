/**
 * PreToolUse output building
 */

import type { PreToolUseOutput } from './types.js';

/**
 * Builds the PreToolUse hook output structure.
 * Always non-blocking (permissionDecision: 'allow').
 *
 * @param additionalContext - Context string to inject
 * @returns PreToolUseOutput ready for stdout
 */
export function buildPreToolUseOutput(
  additionalContext: string
): PreToolUseOutput {
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      additionalContext,
      permissionDecision: 'allow',
    },
  };
}
