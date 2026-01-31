import { describe, it, expect } from 'vitest';
import { normalizePrompt } from '../src/normalize.js';

describe('normalizePrompt', () => {
  describe('empty and whitespace handling', () => {
    it('should return empty string for empty input', () => {
      expect(normalizePrompt('')).toBe('');
    });

    it('should return empty string for whitespace-only input', () => {
      expect(normalizePrompt('   ')).toBe('');
      expect(normalizePrompt('\t\t')).toBe('');
      expect(normalizePrompt('\n\n')).toBe('');
      expect(normalizePrompt('  \t\n  ')).toBe('');
    });
  });

  describe('case normalization', () => {
    it('should convert to lowercase', () => {
      expect(normalizePrompt('Hello World')).toBe('hello world');
      expect(normalizePrompt('UPPERCASE')).toBe('uppercase');
      expect(normalizePrompt('MiXeD CaSe')).toBe('mixed case');
    });
  });

  describe('punctuation handling', () => {
    it('should remove punctuation except dots and slashes', () => {
      expect(normalizePrompt('hello, world!')).toBe('hello world');
      expect(normalizePrompt('what? why!')).toBe('what why');
      expect(normalizePrompt('test@email.com')).toBe('test email.com');
    });

    it('should preserve dots in file extensions', () => {
      expect(normalizePrompt('file.pdf')).toBe('file.pdf');
      expect(normalizePrompt('document.docx')).toBe('document.docx');
      expect(normalizePrompt('script.test.ts')).toBe('script.test.ts');
    });

    it('should preserve forward slashes in paths', () => {
      expect(normalizePrompt('invoices/march.pdf')).toBe('invoices/march.pdf');
      expect(normalizePrompt('src/lib/utils.ts')).toBe('src/lib/utils.ts');
    });

    it('should handle mixed punctuation', () => {
      expect(normalizePrompt('Process the file: invoices/march.pdf!')).toBe(
        'process the file invoices/march.pdf'
      );
    });
  });

  describe('whitespace collapsing', () => {
    it('should collapse multiple spaces', () => {
      expect(normalizePrompt('hello    world')).toBe('hello world');
      expect(normalizePrompt('one   two   three')).toBe('one two three');
    });

    it('should trim leading and trailing whitespace', () => {
      expect(normalizePrompt('  hello  ')).toBe('hello');
      expect(normalizePrompt('\n\thello world\t\n')).toBe('hello world');
    });
  });

  describe('unicode handling', () => {
    it('should handle unicode characters gracefully', () => {
      expect(normalizePrompt('héllo wörld')).toBe('héllo wörld');
      expect(normalizePrompt('日本語')).toBe('日本語');
      expect(normalizePrompt('emoji 🚀 test')).toBe('emoji test');
    });
  });

  describe('complex examples from SRS', () => {
    it('should normalize invoice processing prompt', () => {
      expect(normalizePrompt('Process the invoice in invoices/march.pdf')).toBe(
        'process the invoice in invoices/march.pdf'
      );
    });

    it('should normalize general question', () => {
      expect(normalizePrompt('What is the capital of France?')).toBe(
        'what is the capital of france'
      );
    });
  });

  describe('performance', () => {
    it('should process 10,000 character input in under 1ms', () => {
      const longInput = 'a'.repeat(10000);
      const start = performance.now();
      normalizePrompt(longInput);
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(1);
    });
  });
});
