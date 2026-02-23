/**
 * Prompt normalization functions
 */

/**
 * Normalizes a user prompt for signal extraction.
 *
 * Algorithm (per SRS 6.2):
 * 1. Convert to lowercase
 * 2. Remove punctuation except dots in file extensions and slashes in paths
 * 3. Collapse multiple spaces
 * 4. Trim whitespace
 *
 * @param prompt - The raw user prompt
 * @returns Normalized prompt string
 */
export function normalizePrompt(prompt: string): string {
  if (!prompt) {
    return '';
  }

  let result = prompt;

  // Step 1: Convert to lowercase
  result = result.toLowerCase();

  // Step 2: Remove punctuation except dots, slashes, and alphanumeric
  // Pattern: [^\w\s./] - matches anything that's not word char, whitespace, dot, or slash
  // Also remove emojis and other unicode symbols (keep letters including accented ones)
  result = result.replace(/[^\p{L}\p{N}\s./]/gu, ' ');

  // Step 3: Collapse multiple spaces
  result = result.replace(/\s+/g, ' ');

  // Step 4: Trim whitespace
  result = result.trim();

  return result;
}
