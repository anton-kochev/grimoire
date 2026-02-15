/**
 * Stemming and fuzzy matching for keyword scoring
 */

/** Discount factor applied to fuzzy match scores */
export const FUZZY_DISCOUNT = 0.8;

/**
 * Match quality in priority order: exact > stem > fuzzy
 */
export type MatchQuality = 'exact' | 'stem' | 'fuzzy';

export interface KeywordMatchResult {
  matched: boolean;
  quality: MatchQuality;
  matchedWord: string;
}

const NO_MATCH: KeywordMatchResult = {
  matched: false,
  quality: 'exact',
  matchedWord: '',
};

/**
 * Lightweight suffix-stripping stemmer.
 * Words shorter than 4 characters are returned unchanged.
 */
export function stem(word: string): string {
  if (word.length < 4) return word;

  // -tion → -t
  if (word.endsWith('tion')) return word.slice(0, -3);
  // -ment
  if (word.endsWith('ment')) return word.slice(0, -4);
  // -ness
  if (word.endsWith('ness')) return word.slice(0, -4);
  // -able
  if (word.endsWith('able')) return word.slice(0, -4);
  // -ible
  if (word.endsWith('ible')) return word.slice(0, -4);

  // -ing with doubled consonant: running → run
  if (word.endsWith('ing')) {
    const base = word.slice(0, -3);
    if (base.length >= 2 && base[base.length - 1] === base[base.length - 2]) {
      return base.slice(0, -1);
    }
    return base.length >= 2 ? base : word;
  }

  // -ly
  if (word.endsWith('ly') && word.length > 4) return word.slice(0, -2);

  // -ies → -y (e.g., "queries" → "query")
  if (word.endsWith('ies')) return word.slice(0, -3) + 'y';
  // -ied → -y (e.g., "applied" → "apply")
  if (word.endsWith('ied')) return word.slice(0, -3) + 'y';

  // -ed with doubled consonant: stopped → stop
  if (word.endsWith('ed')) {
    const base = word.slice(0, -2);
    if (base.length >= 2 && base[base.length - 1] === base[base.length - 2]) {
      return base.slice(0, -1);
    }
    return base.length >= 2 ? base : word;
  }

  // -es after sibilants (ches, shes, ses, xes, zes) → strip -es
  if (
    word.endsWith('ches') ||
    word.endsWith('shes') ||
    word.endsWith('ses') ||
    word.endsWith('xes') ||
    word.endsWith('zes')
  ) {
    return word.slice(0, -2);
  }

  // -s (but not -ss)
  if (word.endsWith('s') && !word.endsWith('ss')) {
    return word.slice(0, -1);
  }

  return word;
}

/**
 * Levenshtein distance with early termination.
 * Uses O(min(m,n)) space via single-row DP.
 *
 * @returns Edit distance, or maxDistance+1 if distance exceeds maxDistance
 */
export function levenshteinDistance(
  a: string,
  b: string,
  maxDistance: number
): number {
  // Ensure a is the shorter string for O(min(m,n)) space
  if (a.length > b.length) {
    [a, b] = [b, a];
  }

  const m = a.length;
  const n = b.length;

  // Quick length-difference check
  if (n - m > maxDistance) return maxDistance + 1;

  // Identical strings
  if (a === b) return 0;

  // One empty string
  if (m === 0) return n <= maxDistance ? n : maxDistance + 1;

  // Single-row DP
  const row = new Array<number>(m + 1);
  for (let j = 0; j <= m; j++) row[j] = j;

  for (let i = 1; i <= n; i++) {
    let prev = row[0]!;
    row[0] = i;
    let rowMin = row[0]!;

    for (let j = 1; j <= m; j++) {
      const cost = b[i - 1] === a[j - 1] ? 0 : 1;
      const val = Math.min(
        row[j]! + 1, // deletion
        row[j - 1]! + 1, // insertion
        prev + cost // substitution
      );
      prev = row[j]!;
      row[j] = val;
      if (val < rowMin) rowMin = val;
    }

    // Early termination: if all values in this row exceed maxDistance
    if (rowMin > maxDistance) return maxDistance + 1;
  }

  return row[m]!;
}

/**
 * Returns the maximum allowed edit distance for a keyword of a given length.
 * Short words (1-3 chars) get no fuzzy matching to avoid false positives.
 */
export function fuzzyThreshold(wordLength: number): number {
  if (wordLength <= 4) return 0;
  if (wordLength <= 6) return 1;
  return 2;
}

/**
 * Pre-computes a map from stemmed form → original word for all prompt words.
 * Used once per scoring call to avoid redundant stem() calls.
 */
export function buildStemmedWordMap(words: Set<string>): Map<string, string> {
  const map = new Map<string, string>();
  for (const word of words) {
    const stemmed = stem(word);
    // Only store if stem differs from original (exact match is checked separately)
    if (stemmed !== word) {
      map.set(stemmed, word);
    }
  }
  return map;
}

/**
 * Matches a single keyword against prompt words using the priority chain:
 * exact → stem → fuzzy.
 *
 * @param keywordLower - The keyword in lowercase
 * @param words - Set of normalized prompt words
 * @param stemmedWords - Pre-computed stem → original word map
 * @returns Match result with quality level and the matched word
 */
export function matchKeyword(
  keywordLower: string,
  words: Set<string>,
  stemmedWords: Map<string, string>
): KeywordMatchResult {
  // 1. Exact match
  if (words.has(keywordLower)) {
    return { matched: true, quality: 'exact', matchedWord: keywordLower };
  }

  // 2. Stem match: stem the keyword and look for it in the stemmed prompt words
  const keywordStem = stem(keywordLower);
  // Check if any prompt word stems to the same root
  if (stemmedWords.has(keywordStem)) {
    return {
      matched: true,
      quality: 'stem',
      matchedWord: stemmedWords.get(keywordStem)!,
    };
  }
  // Also check if the keyword stem matches any original word directly
  if (keywordStem !== keywordLower && words.has(keywordStem)) {
    return { matched: true, quality: 'stem', matchedWord: keywordStem };
  }

  // 3. Fuzzy match
  const maxDist = fuzzyThreshold(keywordLower.length);
  if (maxDist === 0) return NO_MATCH;

  for (const word of words) {
    const dist = levenshteinDistance(keywordLower, word, maxDist);
    if (dist <= maxDist) {
      return { matched: true, quality: 'fuzzy', matchedWord: word };
    }
  }

  return NO_MATCH;
}
