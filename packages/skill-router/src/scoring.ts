/**
 * Skill scoring functions
 */

import type {
  SkillDefinition,
  SkillWeights,
  ExtractedSignals,
  SkillScoreResult,
  MatchedSignal,
} from './types.js';
import {
  buildStemmedWordMap,
  matchKeyword,
  FUZZY_DISCOUNT,
} from './matching.js';

/**
 * Scores a skill against extracted signals from a prompt.
 *
 * @param skill - The skill definition to score
 * @param signals - Signals extracted from the normalized prompt
 * @param normalizedPrompt - The normalized prompt (for pattern matching)
 * @param weights - Scoring weights for each signal type
 * @returns SkillScoreResult with score and matched signals
 */
export function scoreSkill(
  skill: SkillDefinition,
  signals: ExtractedSignals,
  normalizedPrompt: string,
  weights: SkillWeights
): SkillScoreResult {
  let score = 0;
  const matchedSignals: MatchedSignal[] = [];

  const triggers = skill.triggers;

  // 6.4.1 Keyword matching (exact, stem, fuzzy)
  if (triggers.keywords) {
    const stemmedWords = buildStemmedWordMap(signals.words);
    for (const keyword of triggers.keywords) {
      const keywordLower = keyword.toLowerCase();
      const result = matchKeyword(keywordLower, signals.words, stemmedWords);
      if (result.matched) {
        const weight =
          result.quality === 'fuzzy'
            ? weights.keywords * FUZZY_DISCOUNT
            : weights.keywords;
        score += weight;
        matchedSignals.push({
          type: 'keyword',
          value: keyword,
          matchQuality: result.quality,
        });
      }
    }
  }

  // 6.4.2 File extension matching
  if (triggers.file_extensions) {
    for (const ext of triggers.file_extensions) {
      const extLower = ext.toLowerCase();
      if (signals.extensions.has(extLower)) {
        score += weights.file_extensions;
        matchedSignals.push({
          type: 'extension',
          value: ext,
        });
      }
    }
  }

  // 6.4.3 Pattern matching
  if (triggers.patterns) {
    for (const pattern of triggers.patterns) {
      try {
        const regex = new RegExp(pattern, 'i');
        if (regex.test(normalizedPrompt)) {
          score += weights.patterns;
          matchedSignals.push({
            type: 'pattern',
            value: pattern,
          });
        }
      } catch {
        // Log warning for invalid regex, skip pattern
        console.warn(`Invalid regex pattern: ${pattern}`);
      }
    }
  }

  // 6.4.4 File path matching
  if (triggers.file_paths) {
    for (const pathPrefix of triggers.file_paths) {
      const pathPrefixLower = pathPrefix.toLowerCase();
      let matched = false;

      for (const promptPath of signals.paths) {
        if (promptPath.startsWith(pathPrefixLower)) {
          matched = true;
          break; // Only count each path_prefix once
        }
      }

      if (matched) {
        score += weights.file_paths;
        matchedSignals.push({
          type: 'path',
          value: pathPrefix,
        });
      }
    }
  }

  return {
    skill: {
      path: skill.path,
      name: skill.name,
    },
    score,
    matchedSignals,
  };
}
