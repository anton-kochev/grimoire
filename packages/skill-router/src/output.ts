/**
 * Hook output building
 */

import type { HookOutput, HookEventName } from './types.js';

/**
 * Builds the hook output structure for Claude Code.
 *
 * @param additionalContext - Context string to inject into the conversation
 * @param hookEventName - The hook event type (defaults to UserPromptSubmit)
 * @returns HookOutput ready for stdout
 */
export function buildHookOutput(
  additionalContext: string,
  hookEventName: HookEventName = 'UserPromptSubmit'
): HookOutput {
  return {
    hookSpecificOutput: {
      hookEventName,
      additionalContext,
    },
  };
}
