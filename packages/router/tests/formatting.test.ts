import { describe, it, expect } from 'vitest';
import {
  summarizeSignals,
  formatContext,
} from '../src/formatting.js';
import type { MatchedSignal } from '../src/types.js';

describe('summarizeSignals', () => {
  it('should format single keyword', () => {
    const signals: MatchedSignal[] = [{ type: 'keyword', value: 'invoice' }];
    expect(summarizeSignals(signals)).toBe('keywords[invoice]');
  });

  it('should format multiple keywords', () => {
    const signals: MatchedSignal[] = [
      { type: 'keyword', value: 'invoice' },
      { type: 'keyword', value: 'receipt' },
    ];
    expect(summarizeSignals(signals)).toBe('keywords[invoice, receipt]');
  });

  it('should format extensions', () => {
    const signals: MatchedSignal[] = [
      { type: 'extension', value: '.pdf' },
      { type: 'extension', value: '.docx' },
    ];
    expect(summarizeSignals(signals)).toBe('extensions[.pdf, .docx]');
  });

  it('should format patterns with count', () => {
    const signals: MatchedSignal[] = [
      { type: 'pattern', value: 'process.*invoice' },
      { type: 'pattern', value: 'extract.*data' },
    ];
    expect(summarizeSignals(signals)).toBe('patterns[2 matched]');
  });

  it('should format paths', () => {
    const signals: MatchedSignal[] = [
      { type: 'path', value: 'invoices/' },
      { type: 'path', value: 'receipts/' },
    ];
    expect(summarizeSignals(signals)).toBe('paths[invoices/, receipts/]');
  });

  it('should combine all signal types in order', () => {
    const signals: MatchedSignal[] = [
      { type: 'keyword', value: 'invoice' },
      { type: 'extension', value: '.pdf' },
      { type: 'pattern', value: 'process.*' },
      { type: 'path', value: 'invoices/' },
    ];
    expect(summarizeSignals(signals)).toBe(
      'keywords[invoice], extensions[.pdf], patterns[1 matched], paths[invoices/]'
    );
  });

  it('should return empty string for empty signals', () => {
    expect(summarizeSignals([])).toBe('');
  });
});

describe('formatContext', () => {
  // Helper to create result
  function createResult(
    name: string,
    path: string,
    score: number,
    signals: MatchedSignal[] = []
  ): SkillScoreResult {
    return {
      skill: { name, path },
      score,
      matchedSignals: signals,
    };
  }

  it('should format single skill match', () => {
    const results = [
      createResult('Invoice Processor', '/skills/invoice', 5.0, [
        { type: 'keyword', value: 'invoice' },
      ]),
    ];

    const context = formatContext(results);

    expect(context).toContain('[Skill Router]');
    expect(context).toContain('Invoice Processor');
    expect(context).toContain('/skills/invoice/SKILL.md');
    expect(context).toContain('5.0');
    expect(context).toContain('keywords[invoice]');
    expect(context).toContain('Please read the SKILL.md');
  });

  it('should format multiple skill matches', () => {
    const results = [
      createResult('Skill A', '/skills/a', 7.0, [
        { type: 'keyword', value: 'test' },
      ]),
      createResult('Skill B', '/skills/b', 5.0, [
        { type: 'extension', value: '.ts' },
      ]),
    ];

    const context = formatContext(results);

    expect(context).toContain('Skill A');
    expect(context).toContain('Skill B');
    expect(context).toContain('7.0');
    expect(context).toContain('5.0');
  });

  it('should format score with 1 decimal place', () => {
    const results = [
      createResult('Test', '/skills/test', 7.5, []),
    ];

    const context = formatContext(results);
    expect(context).toContain('7.5');
  });

  it('should handle whole number scores', () => {
    const results = [
      createResult('Test', '/skills/test', 7.0, []),
    ];

    const context = formatContext(results);
    expect(context).toContain('7.0');
  });

  it('should keep fallback read message when no content map provided', () => {
    const results = [
      createResult('Test', '/skills/test', 5.0, []),
    ];

    const context = formatContext(results);

    expect(context).toContain('Please read the SKILL.md');
  });

  it('should keep fallback read message when content map is empty', () => {
    const results = [
      createResult('Test', '/skills/test', 5.0, []),
    ];

    const context = formatContext(results, new Map());

    expect(context).toContain('Please read the SKILL.md');
  });

  it('should inject skill body when content map has matching entry', () => {
    const results = [
      createResult('Invoice Processor', '/skills/invoice', 5.0, [
        { type: 'keyword', value: 'invoice' },
      ]),
    ];
    const contents = new Map([['/skills/invoice', '# Invoice Processor\n\nProcess invoices.']]);

    const context = formatContext(results, contents);

    expect(context).toContain('# Invoice Processor');
    expect(context).toContain('Process invoices.');
  });

  it('should change closing message when content is injected', () => {
    const results = [
      createResult('Test Skill', '/skills/test', 5.0, []),
    ];
    const contents = new Map([['/skills/test', '# Test\n\nBody.']]);

    const context = formatContext(results, contents);

    expect(context).toContain('Follow the skill instructions above.');
    expect(context).not.toContain('Please read the SKILL.md');
  });

  it('should still list skills without content in map normally', () => {
    const results = [
      createResult('Skill A', '/skills/a', 7.0, [
        { type: 'keyword', value: 'test' },
      ]),
      createResult('Skill B', '/skills/b', 5.0, [
        { type: 'extension', value: '.ts' },
      ]),
    ];
    // Only Skill A has content
    const contents = new Map([['/skills/a', '# Skill A\n\nContent A.']]);

    const context = formatContext(results, contents);

    // Both listed in summary
    expect(context).toContain('Skill A');
    expect(context).toContain('Skill B');
    // Only Skill A content injected
    expect(context).toContain('Content A.');
    // Still uses injected message since at least one was injected
    expect(context).toContain('Follow the skill instructions above.');
  });

  it('should separate injected content sections with dividers', () => {
    const results = [
      createResult('Skill A', '/skills/a', 7.0, []),
      createResult('Skill B', '/skills/b', 5.0, []),
    ];
    const contents = new Map([
      ['/skills/a', '# Skill A\n\nContent A.'],
      ['/skills/b', '# Skill B\n\nContent B.'],
    ]);

    const context = formatContext(results, contents);

    expect(context).toContain('Content A.');
    expect(context).toContain('Content B.');
    // Dividers between sections
    expect(context).toContain('---');
  });
});

