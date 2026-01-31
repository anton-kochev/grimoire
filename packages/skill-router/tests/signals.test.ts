import { describe, it, expect } from 'vitest';
import { extractSignals } from '../src/signals.js';

describe('extractSignals', () => {
  describe('word extraction', () => {
    it('should extract words with minimum 2 characters', () => {
      const signals = extractSignals('process the invoice');
      expect(signals.words.has('process')).toBe(true);
      expect(signals.words.has('the')).toBe(true);
      expect(signals.words.has('invoice')).toBe(true);
    });

    it('should ignore single character words', () => {
      const signals = extractSignals('a b c test');
      expect(signals.words.has('a')).toBe(false);
      expect(signals.words.has('b')).toBe(false);
      expect(signals.words.has('c')).toBe(false);
      expect(signals.words.has('test')).toBe(true);
    });

    it('should return empty set for empty input', () => {
      const signals = extractSignals('');
      expect(signals.words.size).toBe(0);
    });
  });

  describe('file extension extraction', () => {
    it('should extract file extensions with leading dot', () => {
      const signals = extractSignals('file.pdf document.docx');
      expect(signals.extensions.has('.pdf')).toBe(true);
      expect(signals.extensions.has('.docx')).toBe(true);
    });

    it('should handle multiple dots in filename', () => {
      const signals = extractSignals('script.test.ts');
      expect(signals.extensions.has('.ts')).toBe(true);
    });

    it('should not extract invalid extensions', () => {
      const signals = extractSignals('no extension here');
      expect(signals.extensions.size).toBe(0);
    });

    it('should handle extensions up to 10 characters', () => {
      const signals = extractSignals('file.typescript');
      expect(signals.extensions.has('.typescript')).toBe(true);
    });

    it('should ignore extensions longer than 10 characters', () => {
      const signals = extractSignals('file.verylongextension');
      expect(signals.extensions.has('.verylongextension')).toBe(false);
    });
  });

  describe('path extraction', () => {
    it('should extract file paths with forward slashes', () => {
      const signals = extractSignals('look at invoices/march.pdf');
      expect(signals.paths).toContain('invoices/march.pdf');
    });

    it('should extract nested paths', () => {
      const signals = extractSignals('src/lib/utils/helper.ts');
      expect(signals.paths).toContain('src/lib/utils/helper.ts');
    });

    it('should handle multiple paths', () => {
      const signals = extractSignals('compare src/old.ts with lib/new.ts');
      expect(signals.paths).toContain('src/old.ts');
      expect(signals.paths).toContain('lib/new.ts');
    });

    it('should return empty array when no paths', () => {
      const signals = extractSignals('no paths here');
      expect(signals.paths).toHaveLength(0);
    });
  });

  describe('combined extraction', () => {
    it('should extract all signal types from complex prompt', () => {
      const signals = extractSignals(
        'process the invoice in invoices/march.pdf'
      );

      // Words
      expect(signals.words.has('process')).toBe(true);
      expect(signals.words.has('invoice')).toBe(true);

      // Extensions
      expect(signals.extensions.has('.pdf')).toBe(true);

      // Paths
      expect(signals.paths).toContain('invoices/march.pdf');
    });

    it('should handle SRS example: invoice processing', () => {
      // From SRS Appendix B.1
      const signals = extractSignals(
        'process the invoice in invoices/march.pdf'
      );

      expect(signals.words.has('process')).toBe(true);
      expect(signals.words.has('the')).toBe(true);
      expect(signals.words.has('invoice')).toBe(true);
      expect(signals.words.has('in')).toBe(true);
      expect(signals.words.has('invoices')).toBe(true);
      expect(signals.words.has('march')).toBe(true);
      expect(signals.words.has('pdf')).toBe(true);

      expect(signals.extensions.has('.pdf')).toBe(true);
      expect(signals.paths).toContain('invoices/march.pdf');
    });
  });

  describe('edge cases', () => {
    it('should handle path without extension', () => {
      const signals = extractSignals('look in src/components');
      expect(signals.paths).toContain('src/components');
    });

    it('should handle standalone extension-like strings', () => {
      const signals = extractSignals('use .gitignore pattern');
      expect(signals.extensions.has('.gitignore')).toBe(true);
    });
  });

  describe('performance', () => {
    it('should process 10,000 character input in under 1ms', () => {
      const longInput = 'word '.repeat(2000);
      const start = performance.now();
      extractSignals(longInput);
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(1);
    });
  });
});
