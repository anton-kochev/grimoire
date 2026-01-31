/**
 * Signal extraction functions
 */

import type { ExtractedSignals } from './types.js';

/**
 * Extracts matchable signals from a normalized prompt.
 *
 * Signals include:
 * - Words: tokens of 2+ characters
 * - Extensions: file extensions like .pdf, .ts (1-10 chars after dot)
 * - Paths: sequences containing forward slashes
 *
 * @param normalizedPrompt - A prompt that has been normalized
 * @returns ExtractedSignals containing words, extensions, and paths
 */
export function extractSignals(normalizedPrompt: string): ExtractedSignals {
  const signals: ExtractedSignals = {
    words: new Set<string>(),
    extensions: new Set<string>(),
    paths: [],
  };

  if (!normalizedPrompt) {
    return signals;
  }

  // Extract words (minimum 2 characters)
  // Split on whitespace, then also extract words from path segments
  // This ensures "invoices/march.pdf" yields words: invoices, march, pdf
  const tokens = normalizedPrompt.split(/\s+/);
  for (const token of tokens) {
    // Split token further on slashes and dots to get individual words
    const subWords = token.split(/[/.]/);
    for (const word of subWords) {
      if (word.length >= 2) {
        signals.words.add(word);
      }
    }
  }

  // Extract file extensions
  // Pattern: dot followed by 1-10 alphanumeric characters at word boundary
  const extensionPattern = /\.[a-z0-9]{1,10}\b/g;
  const extensionMatches = normalizedPrompt.match(extensionPattern);
  if (extensionMatches) {
    for (const ext of extensionMatches) {
      signals.extensions.add(ext);
    }
  }

  // Extract file paths
  // Pattern: sequences containing forward slash
  const pathPattern = /[a-z0-9._-]*\/[a-z0-9._/-]*/g;
  const pathMatches = normalizedPrompt.match(pathPattern);
  if (pathMatches) {
    for (const path of pathMatches) {
      signals.paths.push(path);
    }
  }

  return signals;
}
