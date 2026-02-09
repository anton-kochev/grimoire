import { describe, it, expect } from 'vitest';
import {
  stem,
  levenshteinDistance,
  fuzzyThreshold,
  matchKeyword,
  buildStemmedWordMap,
  FUZZY_DISCOUNT,
} from '../src/matching.js';

describe('stem', () => {
  it('should return short words unchanged', () => {
    expect(stem('go')).toBe('go');
    expect(stem('do')).toBe('do');
    expect(stem('the')).toBe('the');
  });

  it('should strip -s suffix', () => {
    expect(stem('tests')).toBe('test');
    expect(stem('files')).toBe('file');
    expect(stem('keywords')).toBe('keyword');
  });

  it('should not strip -ss', () => {
    expect(stem('lass')).toBe('lass');
    expect(stem('pass')).toBe('pass');
    expect(stem('boss')).toBe('boss');
  });

  it('should strip -es suffix', () => {
    expect(stem('processes')).toBe('process');
    expect(stem('matches')).toBe('match');
  });

  it('should not strip -es from -ss words', () => {
    expect(stem('lass')).toBe('lass');
  });

  it('should handle -ies → -y', () => {
    expect(stem('queries')).toBe('query');
    expect(stem('entries')).toBe('entry');
  });

  it('should handle -ied → -y', () => {
    expect(stem('applied')).toBe('apply');
    expect(stem('modified')).toBe('modify');
  });

  it('should strip -ed suffix', () => {
    expect(stem('tested')).toBe('test');
    expect(stem('matched')).toBe('match');
  });

  it('should handle doubled consonant with -ed', () => {
    expect(stem('stopped')).toBe('stop');
    expect(stem('dropped')).toBe('drop');
  });

  it('should strip -ing suffix', () => {
    expect(stem('testing')).toBe('test');
    expect(stem('matching')).toBe('match');
  });

  it('should handle doubled consonant with -ing', () => {
    expect(stem('running')).toBe('run');
    expect(stem('stopping')).toBe('stop');
    expect(stem('dropping')).toBe('drop');
  });

  it('should strip -tion → -t', () => {
    expect(stem('action')).toBe('act');
    expect(stem('activation')).toBe('activat');
  });

  it('should strip -ment', () => {
    expect(stem('deployment')).toBe('deploy');
    expect(stem('management')).toBe('manage');
  });

  it('should strip -ness', () => {
    expect(stem('darkness')).toBe('dark');
    expect(stem('readiness')).toBe('readi');
  });

  it('should strip -able', () => {
    expect(stem('readable')).toBe('read');
    expect(stem('testable')).toBe('test');
  });

  it('should strip -ible', () => {
    expect(stem('visible')).toBe('vis');
    expect(stem('flexible')).toBe('flex');
  });

  it('should strip -ly', () => {
    expect(stem('quickly')).toBe('quick');
    expect(stem('slowly')).toBe('slow');
  });

  it('should not strip -ly from short words', () => {
    expect(stem('holy')).toBe('holy');
  });

  it('should be idempotent for already-stemmed words', () => {
    expect(stem('test')).toBe('test');
    expect(stem('match')).toBe('match');
    expect(stem('run')).toBe('run');
  });
});

describe('levenshteinDistance', () => {
  it('should return 0 for identical strings', () => {
    expect(levenshteinDistance('test', 'test', 2)).toBe(0);
    expect(levenshteinDistance('', '', 2)).toBe(0);
  });

  it('should handle empty strings', () => {
    expect(levenshteinDistance('', 'abc', 5)).toBe(3);
    expect(levenshteinDistance('abc', '', 5)).toBe(3);
  });

  it('should calculate substitution distance', () => {
    expect(levenshteinDistance('test', 'tast', 2)).toBe(1);
    expect(levenshteinDistance('test', 'tist', 2)).toBe(1);
  });

  it('should calculate insertion distance', () => {
    expect(levenshteinDistance('test', 'ttest', 2)).toBe(1);
    expect(levenshteinDistance('test', 'tests', 2)).toBe(1);
  });

  it('should calculate deletion distance', () => {
    expect(levenshteinDistance('test', 'tes', 2)).toBe(1);
    expect(levenshteinDistance('test', 'tst', 2)).toBe(1);
  });

  it('should early-terminate when distance exceeds maxDistance', () => {
    // "test" vs "abcd" = 4, maxDistance 2 → should return 3
    expect(levenshteinDistance('test', 'abcd', 2)).toBe(3);
  });

  it('should early-terminate on length difference', () => {
    expect(levenshteinDistance('ab', 'abcdef', 2)).toBe(3);
  });

  it('should handle distance exactly at maxDistance', () => {
    expect(levenshteinDistance('test', 'tets', 1)).toBe(2);
    expect(levenshteinDistance('test', 'tets', 2)).toBe(2);
  });
});

describe('fuzzyThreshold', () => {
  it('should return 0 for short words (1-3 chars)', () => {
    expect(fuzzyThreshold(1)).toBe(0);
    expect(fuzzyThreshold(2)).toBe(0);
    expect(fuzzyThreshold(3)).toBe(0);
  });

  it('should return 1 for medium words (4-5 chars)', () => {
    expect(fuzzyThreshold(4)).toBe(1);
    expect(fuzzyThreshold(5)).toBe(1);
  });

  it('should return 2 for long words (6+ chars)', () => {
    expect(fuzzyThreshold(6)).toBe(2);
    expect(fuzzyThreshold(10)).toBe(2);
    expect(fuzzyThreshold(20)).toBe(2);
  });
});

describe('buildStemmedWordMap', () => {
  it('should map stemmed forms to original words', () => {
    const words = new Set(['testing', 'running', 'files']);
    const map = buildStemmedWordMap(words);

    expect(map.get('test')).toBe('testing');
    expect(map.get('run')).toBe('running');
    expect(map.get('file')).toBe('files');
  });

  it('should not include words that do not change when stemmed', () => {
    const words = new Set(['test', 'match', 'run']);
    const map = buildStemmedWordMap(words);

    expect(map.size).toBe(0);
  });
});

describe('matchKeyword', () => {
  it('should prioritize exact match', () => {
    const words = new Set(['test', 'testing']);
    const stemmed = buildStemmedWordMap(words);

    const result = matchKeyword('test', words, stemmed);

    expect(result.matched).toBe(true);
    expect(result.quality).toBe('exact');
    expect(result.matchedWord).toBe('test');
  });

  it('should match via stemming when no exact match', () => {
    const words = new Set(['testing']);
    const stemmed = buildStemmedWordMap(words);

    const result = matchKeyword('test', words, stemmed);

    expect(result.matched).toBe(true);
    expect(result.quality).toBe('stem');
    expect(result.matchedWord).toBe('testing');
  });

  it('should stem the keyword to match original words', () => {
    // Keyword "testing" stems to "test", which exists as a prompt word
    const words = new Set(['test']);
    const stemmed = buildStemmedWordMap(words);

    const result = matchKeyword('testing', words, stemmed);

    expect(result.matched).toBe(true);
    expect(result.quality).toBe('stem');
    expect(result.matchedWord).toBe('test');
  });

  it('should match via fuzzy when no exact or stem match', () => {
    const words = new Set(['tast']); // substitution typo of "test"
    const stemmed = buildStemmedWordMap(words);

    const result = matchKeyword('test', words, stemmed);

    expect(result.matched).toBe(true);
    expect(result.quality).toBe('fuzzy');
    expect(result.matchedWord).toBe('tast');
  });

  it('should not fuzzy-match short words', () => {
    const words = new Set(['do']);
    const stemmed = buildStemmedWordMap(words);

    const result = matchKeyword('go', words, stemmed);

    expect(result.matched).toBe(false);
  });

  it('should return no match when nothing matches', () => {
    const words = new Set(['banana', 'apple']);
    const stemmed = buildStemmedWordMap(words);

    const result = matchKeyword('test', words, stemmed);

    expect(result.matched).toBe(false);
  });

  it('should respect fuzzy distance thresholds', () => {
    // "test" (4 chars) → max distance 1
    const words = new Set(['txst']); // distance 1 from "test"
    const stemmed = buildStemmedWordMap(words);

    expect(matchKeyword('test', words, stemmed).matched).toBe(true);

    // distance 2 from "test" with a 4-char keyword → no match
    const words2 = new Set(['txsx']);
    const stemmed2 = buildStemmedWordMap(words2);

    expect(matchKeyword('test', words2, stemmed2).matched).toBe(false);
  });

  it('should allow distance 2 for keywords of 6+ chars', () => {
    const words = new Set(['deploiy']); // distance 2 from "deploy"
    const stemmed = buildStemmedWordMap(words);

    const result = matchKeyword('deploy', words, stemmed);

    expect(result.matched).toBe(true);
    expect(result.quality).toBe('fuzzy');
  });

  it('should prefer exact over stem when both words present', () => {
    const words = new Set(['test', 'testing']);
    const stemmed = buildStemmedWordMap(words);

    const result = matchKeyword('test', words, stemmed);

    expect(result.quality).toBe('exact');
  });

  it('should prefer stem over fuzzy', () => {
    // "tests" stems to "test", "tset" is fuzzy for "test"
    const words = new Set(['tests', 'tset']);
    const stemmed = buildStemmedWordMap(words);

    const result = matchKeyword('test', words, stemmed);

    expect(result.quality).toBe('stem');
  });
});

describe('FUZZY_DISCOUNT', () => {
  it('should be 0.8', () => {
    expect(FUZZY_DISCOUNT).toBe(0.8);
  });
});

describe('performance', () => {
  it('should match 50 keywords against 200 words in under 50ms', () => {
    const keywords = Array.from({ length: 50 }, (_, i) => `keyword${i}`);
    const wordList = Array.from({ length: 200 }, (_, i) => `word${i}`);
    // Add a few that will actually match
    wordList[10] = 'keyword5';
    wordList[20] = 'keyword10';
    wordList[30] = 'keywrod15'; // fuzzy match

    const words = new Set(wordList);
    const stemmed = buildStemmedWordMap(words);

    const start = performance.now();
    for (const kw of keywords) {
      matchKeyword(kw.toLowerCase(), words, stemmed);
    }
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(50);
  });
});
