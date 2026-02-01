import { describe, it, expect } from 'vitest';
import {
  summarizeSignals,
  formatContext,
  formatAgentContext,
} from '../src/formatting.js';
import type { MatchedSignal, SkillScoreResult } from '../src/types.js';

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
});

describe('formatAgentContext', () => {
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

  it('should format required skills section', () => {
    const context = formatAgentContext(
      ['clean-architecture', 'project-conventions'],
      []
    );

    expect(context).toContain('## Skill Activation Required');
    expect(context).toContain('MUST activate');
    expect(context).toContain('- clean-architecture');
    expect(context).toContain('- project-conventions');
    expect(context).toContain('Use the Skill tool');
  });

  it('should format recommended skills section', () => {
    const matched = [
      createResult('api-design', '/skills/api', 5.0, [
        { type: 'keyword', value: 'endpoint' },
      ]),
    ];

    const context = formatAgentContext([], matched);

    expect(context).toContain('## Recommended Skills');
    expect(context).toContain('api-design');
    expect(context).toContain('(matched: keywords[endpoint])');
    expect(context).toContain('Activate recommended skills');
  });

  it('should format both required and recommended sections', () => {
    const matched = [
      createResult('ef-core', '/skills/ef', 4.0, [
        { type: 'keyword', value: 'database' },
      ]),
    ];

    const context = formatAgentContext(
      ['clean-architecture'],
      matched
    );

    expect(context).toContain('## Skill Activation Required');
    expect(context).toContain('- clean-architecture');
    expect(context).toContain('## Recommended Skills');
    expect(context).toContain('- ef-core');
  });

  it('should return empty string when no skills', () => {
    const context = formatAgentContext([], []);
    expect(context).toBe('');
  });

  it('should handle recommended skills without signals', () => {
    const matched = [
      createResult('some-skill', '/skills/some', 3.0, []),
    ];

    const context = formatAgentContext([], matched);

    expect(context).toContain('- some-skill');
    expect(context).not.toContain('(matched:');
  });

  it('should handle multiple recommended skills with different signals', () => {
    const matched = [
      createResult('skill-a', '/skills/a', 5.0, [
        { type: 'keyword', value: 'api' },
        { type: 'pattern', value: 'endpoint.*' },
      ]),
      createResult('skill-b', '/skills/b', 4.0, [
        { type: 'extension', value: '.cs' },
      ]),
    ];

    const context = formatAgentContext([], matched);

    expect(context).toContain('- skill-a (matched: keywords[api], patterns[1 matched])');
    expect(context).toContain('- skill-b (matched: extensions[.cs])');
  });
});
