/**
 * Test fixtures for skill router tests
 */

/**
 * Sample skill manifest for testing
 */
export const sampleManifest = {
  version: '1.0.0',
  config: {
    weights: {
      keywords: 1.0,
      file_extensions: 1.5,
      patterns: 2.0,
      file_paths: 2.5,
    },
    activation_threshold: 3.0,
    log_path: '.claude/logs/skill-router.log',
  },
  skills: [
    {
      path: '/mnt/skills/user/invoice-processor',
      name: 'Invoice Processor',
      description: 'Handles invoice and receipt processing tasks',
      triggers: {
        keywords: ['invoice', 'receipt', 'billing', 'expense'],
        file_extensions: ['.pdf'],
        patterns: ['process.*invoice', 'extract.*receipt'],
        file_paths: ['invoices/', 'receipts/', 'expenses/'],
      },
    },
    {
      path: '/mnt/skills/user/code-reviewer',
      name: 'Code Reviewer',
      description: 'Reviews code for best practices',
      triggers: {
        keywords: ['review', 'code', 'refactor'],
        file_extensions: ['.ts', '.js', '.py'],
        patterns: ['review.*code', 'check.*quality'],
        file_paths: ['src/', 'lib/'],
      },
    },
  ],
};

/**
 * Sample hook input for testing
 */
export const sampleHookInput = {
  prompt: 'Process the invoice in invoices/march.pdf',
  session_id: '550e8400-e29b-41d4-a716-446655440000',
  timestamp: '2026-01-30T14:32:05.123Z',
};

/**
 * Sample hook input with no matches
 */
export const noMatchHookInput = {
  prompt: 'What is the capital of France?',
  session_id: '550e8400-e29b-41d4-a716-446655440001',
  timestamp: '2026-01-30T14:33:00.000Z',
};

/**
 * Empty hook input for edge case testing
 */
export const emptyHookInput = {
  prompt: '',
  session_id: '550e8400-e29b-41d4-a716-446655440002',
  timestamp: '2026-01-30T14:34:00.000Z',
};

/**
 * Whitespace-only hook input
 */
export const whitespaceHookInput = {
  prompt: '   \t\n  ',
  session_id: '550e8400-e29b-41d4-a716-446655440003',
  timestamp: '2026-01-30T14:35:00.000Z',
};
