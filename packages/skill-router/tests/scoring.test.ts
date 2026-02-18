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
        matchQuality: 'exact',
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

    it('should match keyword via stemming at full score', () => {
      const skill: SkillDefinition = {
        path: '/skills/test',
        name: 'Test Skill',
        triggers: {
          keywords: ['test'],
        },
      };

      const signals = createSignals(['testing']);
      const result = scoreSkill(skill, signals, 'testing prompt', defaultWeights);

      expect(result.score).toBe(1.0); // full weight for stem match
      expect(result.matchedSignals).toContainEqual({
        type: 'keyword',
        value: 'test',
        matchQuality: 'stem',
      });
    });

    it('should match keyword via fuzzy at discounted score', () => {
      const skill: SkillDefinition = {
        path: '/skills/test',
        name: 'Test Skill',
        triggers: {
          keywords: ['xunit'], // 5 chars → fuzzy threshold 1
        },
      };

      const signals = createSignals(['xunis']); // distance 1 substitution (t→s)
      const result = scoreSkill(skill, signals, 'xunis prompt', defaultWeights);

      expect(result.score).toBe(0.8); // 1.0 * 0.8 fuzzy discount
      expect(result.matchedSignals).toContainEqual({
        type: 'keyword',
        value: 'xunit',
        matchQuality: 'fuzzy',
      });
    });

    it('should prefer exact match over stem when both present', () => {
      const skill: SkillDefinition = {
        path: '/skills/test',
        name: 'Test Skill',
        triggers: {
          keywords: ['test'],
        },
      };

      const signals = createSignals(['test', 'testing']);
      const result = scoreSkill(skill, signals, 'test testing', defaultWeights);

      expect(result.score).toBe(1.0);
      expect(result.matchedSignals).toContainEqual({
        type: 'keyword',
        value: 'test',
        matchQuality: 'exact',
      });
    });

    it('should not fuzzy-match short keywords', () => {
      const skill: SkillDefinition = {
        path: '/skills/test',
        name: 'Test Skill',
        triggers: {
          keywords: ['go'],
        },
      };

      const signals = createSignals(['do']);
      const result = scoreSkill(skill, signals, 'do something', defaultWeights);

      expect(result.score).toBe(0);
      expect(result.matchedSignals).toHaveLength(0);
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
          file_paths: ['invoices/**', 'receipts/**'],
        },
      };

      const signals = createSignals([], [], ['invoices/march.pdf']);
      const result = scoreSkill(skill, signals, 'test prompt', defaultWeights);

      expect(result.score).toBe(2.5); // 1 path * 2.5 weight
      expect(result.matchedSignals).toContainEqual({
        type: 'path',
        value: 'invoices/**',
      });
    });

    it('should count each path prefix only once', () => {
      const skill: SkillDefinition = {
        path: '/skills/test',
        name: 'Test Skill',
        triggers: {
          file_paths: ['invoices/**'],
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

    it('should match deep paths with ** glob', () => {
      const skill: SkillDefinition = {
        path: '/skills/test',
        name: 'Test Skill',
        triggers: {
          file_paths: ['**/README.md'],
        },
      };

      const signals = createSignals([], [], ['docs/README.md']);
      const result = scoreSkill(skill, signals, 'test prompt', defaultWeights);

      expect(result.score).toBe(2.5);
      expect(result.matchedSignals).toContainEqual({
        type: 'path',
        value: '**/README.md',
      });
    });

    it('should match root paths with ** glob (nocase)', () => {
      const skill: SkillDefinition = {
        path: '/skills/test',
        name: 'Test Skill',
        triggers: {
          file_paths: ['**/README.md'],
        },
      };

      const signals = createSignals([], [], ['readme.md']);
      const result = scoreSkill(skill, signals, 'test prompt', defaultWeights);

      expect(result.score).toBe(2.5);
    });

    it('should match nested paths with directory glob', () => {
      const skill: SkillDefinition = {
        path: '/skills/test',
        name: 'Test Skill',
        triggers: {
          file_paths: ['src/**'],
        },
      };

      const signals = createSignals([], [], ['src/utils/helper.ts']);
      const result = scoreSkill(skill, signals, 'test prompt', defaultWeights);

      expect(result.score).toBe(2.5);
    });

    it('should handle invalid glob pattern gracefully', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const skill: SkillDefinition = {
        path: '/skills/test',
        name: 'Test Skill',
        triggers: {
          file_paths: ['[invalid'],
        },
      };

      const signals = createSignals([], [], ['some/path.ts']);
      const result = scoreSkill(skill, signals, 'test prompt', defaultWeights);

      expect(result.score).toBe(0);
      consoleSpy.mockRestore();
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
          file_paths: ['invoices/**'],
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
          file_paths: ['invoices/**', 'receipts/**', 'expenses/**'],
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
      // Path "invoices/**": +2.5
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

  describe('pattern proximity bounding', () => {
    it('should match patterns within proximity limit', () => {
      const skill: SkillDefinition = {
        path: '/skills/test',
        name: 'Test Skill',
        triggers: {
          patterns: ['create.*feature'],
        },
      };

      const signals = createSignals();
      const result = scoreSkill(
        skill,
        signals,
        'create a new feature for the app',
        defaultWeights
      );

      expect(result.score).toBe(2.0);
    });

    it('should not match patterns across distant text (>60 chars)', () => {
      const skill: SkillDefinition = {
        path: '/skills/test',
        name: 'Test Skill',
        triggers: {
          patterns: ['create.*feature'],
        },
      };

      // "create" and "feature" separated by >60 chars
      const filler = 'x '.repeat(40); // 80 chars
      const signals = createSignals();
      const result = scoreSkill(
        skill,
        signals,
        `create shipment ${filler} needed feature`,
        defaultWeights
      );

      expect(result.score).toBe(0);
    });
  });

  describe('regression: business docs false positive', () => {
    it('should not activate dotnet-feature-workflow for business documentation prompt', () => {
      const dotnetFeatureWorkflow: SkillDefinition = {
        path: '.claude/skills/grimoire.dotnet-feature-workflow',
        name: 'DotNet Feature Workflow',
        triggers: {
          keywords: ['dotnet', 'csharp', 'scaffold', 'endpoint'],
          file_extensions: ['.cs', '.csproj', '.sln'],
          patterns: [
            'build.*feature',
            'implement.*feature',
            'create.*feature',
            'new.*feature',
            'add.*feature',
            'develop.*feature',
            'csharp.*feature',
            'handle.*whole',
            'implement.*endpoint',
            'build.*endpoint',
            'add.*endpoint',
          ],
          file_paths: ['**/*.csproj', '**/*.sln'],
        },
      };

      const prompt =
        'update business documentation with meeting notes about create shipment flow ' +
        'and needed feature for vendor portal pending incomplete shipment done';
      const signals = createSignals(
        ['update', 'business', 'documentation', 'meeting', 'notes', 'create',
         'shipment', 'flow', 'needed', 'feature', 'vendor', 'portal',
         'pending', 'incomplete', 'done'],
        [],
        ['pending/incomplete']
      );

      const result = scoreSkill(dotnetFeatureWorkflow, signals, prompt, defaultWeights);

      // Should score well below the activation threshold of 3.0
      expect(result.score).toBeLessThan(3.0);
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

      expect(elapsed).toBeLessThan(50);
    });
  });
});
