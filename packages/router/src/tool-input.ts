/**
 * PreToolUse input parsing and signal extraction
 */

import type { PreToolUseInput, ToolName, ExtractedSignals } from './types.js';

const SUPPORTED_TOOLS: ReadonlySet<string> = new Set(['Edit', 'Write', 'MultiEdit']);

/**
 * Detects whether parsed JSON data is from a PreToolUse hook
 * by checking for the presence of a string `tool_name` field.
 */
export function isPreToolUseInput(data: unknown): boolean {
  if (!data || typeof data !== 'object') {
    return false;
  }
  return typeof (data as Record<string, unknown>)['tool_name'] === 'string';
}

/**
 * Parses PreToolUse hook input from a JSON string.
 *
 * @param jsonString - Raw JSON string from stdin
 * @returns Validated PreToolUseInput
 * @throws Error if input is empty, invalid JSON, missing tool_name, or unsupported tool
 */
export function parsePreToolUseInput(jsonString: string): PreToolUseInput {
  if (!jsonString || !jsonString.trim()) {
    throw new Error('Hook input is empty');
  }

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

  // Validate tool_name
  if (typeof input['tool_name'] !== 'string') {
    throw new Error('Hook input must have a tool_name string field');
  }

  const toolName = input['tool_name'];
  if (!SUPPORTED_TOOLS.has(toolName)) {
    throw new Error(
      `Unsupported tool: ${toolName}. Only Edit, Write, and MultiEdit are supported.`
    );
  }

  return {
    session_id:
      typeof input['session_id'] === 'string' ? input['session_id'] : 'unknown',
    hook_event_name: 'PreToolUse',
    tool_name: toolName as ToolName,
    tool_use_id:
      typeof input['tool_use_id'] === 'string' ? input['tool_use_id'] : '',
    tool_input:
      input['tool_input'] && typeof input['tool_input'] === 'object'
        ? (input['tool_input'] as Record<string, unknown>)
        : {},
  };
}

/**
 * Strips the project directory prefix from a file path.
 */
function stripProjectDir(filePath: string, projectDir: string): string {
  const normalizedDir = projectDir.endsWith('/')
    ? projectDir.slice(0, -1)
    : projectDir;

  if (filePath.startsWith(normalizedDir + '/')) {
    return filePath.slice(normalizedDir.length + 1);
  }
  return filePath;
}

/**
 * Extracts file-path-based signals from tool_input.
 *
 * @param toolInput - The tool_input object from PreToolUse stdin
 * @param projectDir - The project directory to strip from absolute paths
 * @returns ExtractedSignals with words, extensions, and paths from the file path
 */
export function extractToolSignals(
  toolInput: Record<string, unknown>,
  projectDir: string
): ExtractedSignals {
  const signals: ExtractedSignals = {
    words: new Set<string>(),
    extensions: new Set<string>(),
    paths: [],
  };

  const filePath = toolInput['file_path'];
  if (typeof filePath !== 'string') {
    return signals;
  }

  // Get relative path
  const relativePath = stripProjectDir(filePath, projectDir);
  signals.paths.push(relativePath.toLowerCase());

  // Extract extension
  const lastDot = relativePath.lastIndexOf('.');
  const lastSlash = relativePath.lastIndexOf('/');
  if (lastDot > lastSlash && lastDot < relativePath.length - 1) {
    signals.extensions.add(relativePath.slice(lastDot).toLowerCase());
  }

  // Extract words from path segments
  const segments = relativePath.split('/');
  for (const segment of segments) {
    // Split on dots to separate filename from extension
    const parts = segment.split('.');
    for (const part of parts) {
      const word = part.toLowerCase();
      if (word.length >= 2) {
        signals.words.add(word);
      }
    }
  }

  return signals;
}
