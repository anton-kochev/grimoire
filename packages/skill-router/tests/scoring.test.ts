import { describe, it, expect, vi } from 'vitest';
import { scoreSkill } from '../src/scoring.js';
import type {
  SkillDefinition,
  SkillWeights,
  ExtractedSignals,
} from '../src/types.js';

// Default weights for testing
const defaultWeights: SkillWeights = {
  keywords: 1.0,
  file_extensions: 1.5,
  patterns: 2.0,
  file_paths: 2.5,
};

// Helper to create signals
function createSignals(
  words: string[] = [],
  extensions: string[] = [],
  paths: string[] = []
): ExtractedSignals {
  return {
    words: new Set(words),
    extensions: new Set(extensions),
    paths,
  };
}

describe('scoreSkill', () => {
  describe('keyword matching', () => {
    it('should match keywords case-insensitively', () => {
      const skill: SkillDefinition = {
        path: '/skills/test',
        name: 'Test Skill',
        triggers: {
          keywords: ['invoice', 'receipt'],
        },
      };

      const signals = createSignals(['invoice', 'the', 'process']);
      const result = scoreSkill(skill, signals, 'test prompt', defaultWeights);

      expect(result.score).toBe(1.0); // 1 keyword * 1.0 weight
      expect(result.matchedSignals).toContainEqual({
        type: 'keyword',
        value: 'invoice',
      });
    });

    it('should match multiple keywords', () => {
      const skill: SkillDefinition = {
        path: '/skills/test',
        name: 'Test Skill',
        triggers: {
          keywords: ['invoice', 'receipt', 'billing'],
        },
      };

      const signals = createSignals(['invoice', 'receipt', 'process']);
      const result = scoreSkill(skill, signals, 'test prompt', defaultWeights);

      expect(result.score).toBe(2.0); // 2 keywords * 1.0 weight
    });
  });

  describe('file extension matching', () => {
    it('should match file extensions', () => {
      const skill: SkillDefinition = {
        path: '/skills/test',
        name: 'Test Skill',
        triggers: {
          file_extensions: ['.pdf', '.docx'],
        },
      };

      const signals = createSignals([], ['.pdf']);
      const result = scoreSkill(skill, signals, 'test prompt', defaultWeights);

      expect(result.score).toBe(1.5); // 1 extension * 1.5 weight
      expect(result.matchedSignals).toContainEqual({
        type: 'extension',
        value: '.pdf',
      });
    });
  });

  describe('pattern matching', () => {
    it('should match regex patterns', () => {
      const skill: SkillDefinition = {
        path: '/skills/test',
        name: 'Test Skill',
        triggers: {
          patterns: ['process.*invoice'],
        },
      };

      const signals = createSignals();
      const result = scoreSkill(
        skill,
        signals,
        'process the invoice',
        defaultWeights
      );

      expect(result.score).toBe(2.0); // 1 pattern * 2.0 weight
      expect(result.matchedSignals).toContainEqual({
        type: 'pattern',
        value: 'process.*invoice',
      });
    });

    it('should handle invalid regex gracefully', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const skill: SkillDefinition = {
        path: '/skills/test',
        name: 'Test Skill',
        triggers: {
          patterns: ['[invalid(regex'],
        },
      };

      const signals = createSignals();
      const result = scoreSkill(skill, signals, 'test prompt', defaultWeights);

      expect(result.score).toBe(0);
      consoleSpy.mockRestore();
    });
  });

  describe('file path matching', () => {
    it('should match path prefixes', () => {
      const skill: SkillDefinition = {
        path: '/skills/test',
        name: 'Test Skill',
        triggers: {
          file_paths: ['invoices/', 'receipts/'],
        },
      };

      const signals = createSignals([], [], ['invoices/march.pdf']);
      const result = scoreSkill(skill, signals, 'test prompt', defaultWeights);

      expect(result.score).toBe(2.5); // 1 path * 2.5 weight
      expect(result.matchedSignals).toContainEqual({
        type: 'path',
        value: 'invoices/',
      });
    });

    it('should count each path prefix only once', () => {
      const skill: SkillDefinition = {
        path: '/skills/test',
        name: 'Test Skill',
        triggers: {
          file_paths: ['invoices/'],
        },
      };

      // Two paths both matching same prefix
      const signals = createSignals([], [], [
        'invoices/march.pdf',
        'invoices/april.pdf',
      ]);
      const result = scoreSkill(skill, signals, 'test prompt', defaultWeights);

      // Should only count prefix once
      expect(result.score).toBe(2.5);
    });
  });

  describe('combined scoring', () => {
    it('should combine all signal types with weights', () => {
      const skill: SkillDefinition = {
        path: '/skills/invoice',
        name: 'Invoice Processor',
        triggers: {
          keywords: ['invoice'],
          file_extensions: ['.pdf'],
          patterns: ['process.*invoice'],
          file_paths: ['invoices/'],
        },
      };

      const signals = createSignals(
        ['invoice', 'process'],
        ['.pdf'],
        ['invoices/march.pdf']
      );

      const result = scoreSkill(
        skill,
        signals,
        'process the invoice in invoices/march.pdf',
        defaultWeights
      );

      // 1 keyword (1.0) + 1 extension (1.5) + 1 pattern (2.0) + 1 path (2.5) = 7.0
      expect(result.score).toBe(7.0);
      expect(result.matchedSignals).toHaveLength(4);
    });

    it('should match SRS example: invoice processing', () => {
      // From SRS Appendix B.1
      const skill: SkillDefinition = {
        path: '/mnt/skills/user/invoice-processor',
        name: 'Invoice Processor',
        triggers: {
          keywords: ['invoice', 'receipt', 'billing', 'expense'],
          file_extensions: ['.pdf'],
          patterns: ['process.*invoice', 'extract.*receipt'],
          file_paths: ['invoices/', 'receipts/', 'expenses/'],
        },
      };

      const signals = createSignals(
        ['process', 'the', 'invoice', 'in', 'invoices', 'march', 'pdf'],
        ['.pdf'],
        ['invoices/march.pdf']
      );

      const result = scoreSkill(
        skill,
        signals,
        'process the invoice in invoices/march.pdf',
        defaultWeights
      );

      // Keyword "invoice": +1.0
      // Extension ".pdf": +1.5
      // Pattern "process.*invoice": +2.0
      // Path "invoices/": +2.5
      // Total: 7.0
      expect(result.score).toBe(7.0);
    });
  });

  describe('edge cases', () => {
    it('should return score 0 when no triggers defined', () => {
      const skill: SkillDefinition = {
        path: '/skills/test',
        name: 'Test Skill',
        triggers: {},
      };

      const signals = createSignals(['test', 'words']);
      const result = scoreSkill(skill, signals, 'test prompt', defaultWeights);

      expect(result.score).toBe(0);
      expect(result.matchedSignals).toHaveLength(0);
    });

    it('should return skill reference in result', () => {
      const skill: SkillDefinition = {
        path: '/skills/test',
        name: 'Test Skill',
        triggers: { keywords: ['test'] },
      };

      const signals = createSignals(['test']);
      const result = scoreSkill(skill, signals, 'test prompt', defaultWeights);

      expect(result.skill.path).toBe('/skills/test');
      expect(result.skill.name).toBe('Test Skill');
    });
  });

  describe('performance', () => {
    it('should score in under 0.5ms', () => {
      const skill: SkillDefinition = {
        path: '/skills/test',
        name: 'Test Skill',
        triggers: {
          keywords: Array.from({ length: 50 }, (_, i) => `keyword${i}`),
          patterns: Array.from({ length: 20 }, (_, i) => `pattern${i}`),
        },
      };

      const signals = createSignals(['keyword1', 'keyword2', 'keyword3']);

      const start = performance.now();
      scoreSkill(skill, signals, 'test prompt', defaultWeights);
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(0.5);
    });
  });
});
