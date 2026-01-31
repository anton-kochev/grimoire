/**
 * Hook output building
 */

import type { HookOutput } from './types.js';

/**
 * Builds the hook output structure for Claude Code.
 *
 * @param additionalContext - Context string to inject into the conversation
 * @returns HookOutput ready for stdout
 */
export function buildHookOutput(additionalContext: string): HookOutput {
  return {
    hookSpecificOutput: {
      hookEventName: 'UserPromptSubmit',
      additionalContext,
    },
  };
}
