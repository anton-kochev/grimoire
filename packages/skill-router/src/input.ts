/**
 * Hook input parsing
 */

import type { HookInput } from './types.js';

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
  const fs = require('fs');
  try {
    return fs.readFileSync(0, 'utf-8');
  } catch {
    return '';
  }
}
