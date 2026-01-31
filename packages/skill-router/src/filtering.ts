/**
 * Filtering and sorting functions for skill results
 */

import type { SkillScoreResult } from './types.js';

/**
 * Filters skill results to only those meeting the activation threshold.
 *
 * @param results - Array of skill score results
 * @param threshold - Minimum score required for activation
 * @returns New array with only results where score >= threshold
 */
export function filterByThreshold(
  results: SkillScoreResult[],
  threshold: number
): SkillScoreResult[] {
  return results.filter((result) => result.score >= threshold);
}

/**
 * Sorts skill results by score descending, with name as tiebreaker.
 *
 * @param results - Array of skill score results
 * @returns New array sorted by score descending, then name ascending
 */
export function sortDescendingByScore(
  results: SkillScoreResult[]
): SkillScoreResult[] {
  return [...results].sort((a, b) => {
    // Primary sort: score descending
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    // Secondary sort: name ascending (alphabetical)
    return a.skill.name.localeCompare(b.skill.name);
  });
}
