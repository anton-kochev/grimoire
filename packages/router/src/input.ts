/**
 * Hook input parsing
 */

import { readFileSync } from 'fs';
import type { HookInput, PreToolUseInput } from './types.js';
import { isPreToolUseInput, parsePreToolUseInput } from './tool-input.js';

/**
 * Discriminated union for stdin input types
 */
export type StdinInput =
  | { kind: 'prompt'; input: HookInput }
  | { kind: 'tooluse'; input: PreToolUseInput };

/**
 * Parses stdin JSON and dispatches to the appropriate parser based on shape.
 *
 * If the data contains a `tool_name` field, it's treated as PreToolUse input.
 * Otherwise, it's treated as a prompt-based hook input (UserPromptSubmit/SubagentStart).
 *
 * @param jsonString - Raw JSON string from stdin
 * @returns Discriminated StdinInput union
 * @throws Error if input is empty, invalid JSON, or validation fails
 */
export function parseStdinInput(jsonString: string): StdinInput {
  if (!jsonString || !jsonString.trim()) {
    throw new Error('Hook input is empty');
  }

  // Peek at the parsed data to determine type
  let data: unknown;
  try {
    data = JSON.parse(jsonString);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse hook input JSON: ${message}`);
  }

  if (isPreToolUseInput(data)) {
    return { kind: 'tooluse', input: parsePreToolUseInput(jsonString) };
  }

  return { kind: 'prompt', input: parseHookInput(jsonString) };
}

/**
 * Parses hook input from JSON string.
 *
 * @param jsonString - Raw JSON string from stdin
 * @returns Validated HookInput
 * @throws Error if input is empty, invalid JSON, or missing required fields
 */
export function parseHookInput(jsonString: string): HookInput {
  // Check for empty input
  if (!jsonString || !jsonString.trim()) {
    throw new Error('Hook input is empty');
  }

  // Parse JSON
  let data: unknown;
  try {
    data = JSON.parse(jsonString);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse hook input JSON: ${message}`);
  }

  if (!data || typeof data !== 'object') {
    throw new Error('Hook input must be an object');
  }

  const input = data as Record<string, unknown>;

  // Validate prompt (required)
  if (input['prompt'] === undefined || input['prompt'] === null) {
    throw new Error('Hook input must have a prompt field');
  }

  if (typeof input['prompt'] !== 'string') {
    throw new Error('Hook input prompt must be a string');
  }

  // Apply defaults for optional fields
  return {
    prompt: input['prompt'],
    session_id:
      typeof input['session_id'] === 'string' ? input['session_id'] : 'unknown',
    timestamp:
      typeof input['timestamp'] === 'string'
        ? input['timestamp']
        : new Date().toISOString(),
  };
}

/**
 * Reads input from stdin synchronously.
 *
 * @returns Raw string from stdin
 */
export function readStdin(): string {
  try {
    return readFileSync(0, 'utf-8');
  } catch {
    return '';
  }
}
