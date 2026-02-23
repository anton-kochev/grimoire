import { describe, it, expect } from 'vitest';
import {
  filterByThreshold,
  sortDescendingByScore,
} from '../src/filtering.js';
import type { SkillScoreResult } from '../src/types.js';

// Helper to create score results
function createResult(
  name: string,
  score: number
): SkillScoreResult {
  return {
    skill: { path: `/skills/${name}`, name },
    score,
    matchedSignals: [],
  };
}

describe('filterByThreshold', () => {
  it('should return empty array for empty input', () => {
    expect(filterByThreshold([], 3.0)).toEqual([]);
  });

  it('should return empty array when all below threshold', () => {
    const results = [createResult('A', 1.0), createResult('B', 2.0)];
    expect(filterByThreshold(results, 3.0)).toEqual([]);
  });

  it('should return all when all above threshold', () => {
    const results = [createResult('A', 4.0), createResult('B', 5.0)];
    const filtered = filterByThreshold(results, 3.0);
    expect(filtered).toHaveLength(2);
  });

  it('should include results exactly at threshold', () => {
    const results = [createResult('A', 3.0), createResult('B', 2.0)];
    const filtered = filterByThreshold(results, 3.0);
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.skill.name).toBe('A');
  });

  it('should filter mixed results', () => {
    const results = [
      createResult('A', 5.0),
      createResult('B', 2.0),
      createResult('C', 4.0),
      createResult('D', 1.0),
    ];
    const filtered = filterByThreshold(results, 3.0);
    expect(filtered).toHaveLength(2);
    expect(filtered.map((r) => r.skill.name)).toContain('A');
    expect(filtered.map((r) => r.skill.name)).toContain('C');
  });

  it('should not mutate original array', () => {
    const results = [createResult('A', 5.0), createResult('B', 2.0)];
    const original = [...results];
    filterByThreshold(results, 3.0);
    expect(results).toEqual(original);
  });
});

describe('sortDescendingByScore', () => {
  it('should return empty array for empty input', () => {
    expect(sortDescendingByScore([])).toEqual([]);
  });

  it('should return single item unchanged', () => {
    const results = [createResult('A', 5.0)];
    const sorted = sortDescendingByScore(results);
    expect(sorted).toHaveLength(1);
    expect(sorted[0]?.skill.name).toBe('A');
  });

  it('should sort by score descending', () => {
    const results = [
      createResult('A', 2.0),
      createResult('B', 5.0),
      createResult('C', 3.0),
    ];
    const sorted = sortDescendingByScore(results);
    expect(sorted[0]?.skill.name).toBe('B');
    expect(sorted[1]?.skill.name).toBe('C');
    expect(sorted[2]?.skill.name).toBe('A');
  });

  it('should sort ties by name ascending (alphabetically)', () => {
    const results = [
      createResult('Zebra', 5.0),
      createResult('Apple', 5.0),
      createResult('Mango', 5.0),
    ];
    const sorted = sortDescendingByScore(results);
    expect(sorted[0]?.skill.name).toBe('Apple');
    expect(sorted[1]?.skill.name).toBe('Mango');
    expect(sorted[2]?.skill.name).toBe('Zebra');
  });

  it('should handle already sorted input', () => {
    const results = [
      createResult('A', 5.0),
      createResult('B', 3.0),
      createResult('C', 1.0),
    ];
    const sorted = sortDescendingByScore(results);
    expect(sorted[0]?.skill.name).toBe('A');
    expect(sorted[1]?.skill.name).toBe('B');
    expect(sorted[2]?.skill.name).toBe('C');
  });

  it('should not mutate original array', () => {
    const results = [createResult('A', 2.0), createResult('B', 5.0)];
    const original = [...results];
    sortDescendingByScore(results);
    expect(results).toEqual(original);
  });
});
