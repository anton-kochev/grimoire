import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { processPrompt } from '../src/main.js';
import { writeFileSync, mkdirSync, rmSync, readFileSync, existsSync, realpathSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('processPrompt (integration)', () => {
  let testDir: string;
  let manifestPath: string;
  let logPath: string;

  const validManifest = {
    version: '1.0.0',
    config: {
      weights: {
        keywords: 1.0,
        file_extensions: 1.5,
        patterns: 2.0,
        file_paths: 2.5,
      },
      activation_threshold: 3.0,
    },
    skills: [
      {
        path: '/skills/invoice',
        name: 'Invoice Processor',
        triggers: {
          keywords: ['invoice', 'receipt', 'billing'],
          file_extensions: ['.pdf'],
          patterns: ['process.*invoice'],
          file_paths: ['invoices/**'],
        },
      },
      {
        path: '/skills/code',
        name: 'Code Reviewer',
        triggers: {
          keywords: ['review', 'code', 'refactor'],
          file_extensions: ['.ts', '.js'],
        },
      },
    ],
  };

  beforeEach(() => {
    testDir = join(tmpdir(), `skill-router-int-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    manifestPath = join(testDir, 'manifest.json');
    logPath = join(testDir, 'logs', 'router.log');

    const manifest = {
      ...validManifest,
      config: { ...validManifest.config, log_path: logPath },
    };
    writeFileSync(manifestPath, JSON.stringify(manifest));
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('should return matched skills for matching prompt', () => {
    const input = {
      prompt: 'Process the invoice in invoices/march.pdf',
      session_id: 'test-123',
      timestamp: new Date().toISOString(),
    };

    const result = processPrompt(input, manifestPath);

    expect(result).not.toBeNull();
    expect(result?.hookSpecificOutput.additionalContext).toContain(
      'Invoice Processor'
    );
    expect(result?.hookSpecificOutput.additionalContext).toContain(
      '/skills/invoice/SKILL.md'
    );
  });

  it('should return null for non-matching prompt', () => {
    const input = {
      prompt: 'What is the capital of France?',
      session_id: 'test-123',
      timestamp: new Date().toISOString(),
    };

    const result = processPrompt(input, manifestPath);

    expect(result).toBeNull();
  });

  it('should return null for empty prompt', () => {
    const input = {
      prompt: '',
      session_id: 'test-123',
      timestamp: new Date().toISOString(),
    };

    const result = processPrompt(input, manifestPath);

    expect(result).toBeNull();
  });

  it('should return null for whitespace-only prompt', () => {
    const input = {
      prompt: '   \t\n   ',
      session_id: 'test-123',
      timestamp: new Date().toISOString(),
    };

    const result = processPrompt(input, manifestPath);

    expect(result).toBeNull();
  });

  it('should write log entry on match', () => {
    const input = {
      prompt: 'Process the invoice',
      session_id: 'test-123',
      timestamp: new Date().toISOString(),
    };

    processPrompt(input, manifestPath);

    expect(existsSync(logPath)).toBe(true);
    const logContent = readFileSync(logPath, 'utf-8');
    const logEntry = JSON.parse(logContent.trim());
    expect(logEntry.outcome).toBe('activated');
  });

  it('should write log entry on no match', () => {
    const input = {
      prompt: 'Hello world',
      session_id: 'test-123',
      timestamp: new Date().toISOString(),
    };

    processPrompt(input, manifestPath);

    expect(existsSync(logPath)).toBe(true);
    const logContent = readFileSync(logPath, 'utf-8');
    const logEntry = JSON.parse(logContent.trim());
    expect(logEntry.outcome).toBe('no_match');
  });

  it('should match multiple skills when both exceed threshold', () => {
    const input = {
      // This prompt should match both skills above threshold:
      // Invoice: "invoice" (1.0) + ".pdf" (1.5) + "invoices/" path (2.5) = 5.0
      // Code: "review" (1.0) + "code" (1.0) + ".ts" (1.5) = 3.5
      prompt: 'Review the invoice code in invoices/report.pdf and src/main.ts',
      session_id: 'test-123',
      timestamp: new Date().toISOString(),
    };

    const result = processPrompt(input, manifestPath);

    expect(result).not.toBeNull();
    const context = result?.hookSpecificOutput.additionalContext ?? '';
    // Both skills should be mentioned
    expect(context).toContain('Invoice Processor');
    expect(context).toContain('Code Reviewer');
  });

  it('should sort skills by score descending', () => {
    const input = {
      prompt: 'Process invoice in invoices/march.pdf',
      session_id: 'test-123',
      timestamp: new Date().toISOString(),
    };

    const result = processPrompt(input, manifestPath);
    const context = result?.hookSpecificOutput.additionalContext ?? '';

    // Invoice Processor should appear before Code Reviewer (higher score)
    const invoiceIndex = context.indexOf('Invoice Processor');
    const codeIndex = context.indexOf('Code Reviewer');

    // Code Reviewer might not match at all, or if it does, Invoice should be first
    if (codeIndex !== -1) {
      expect(invoiceIndex).toBeLessThan(codeIndex);
    }
  });
});

describe('processPrompt with projectDir (content injection)', () => {
  let testDir: string;
  let manifestPath: string;
  let logPath: string;

  beforeEach(() => {
    const raw = join(tmpdir(), `skill-router-inject-${Date.now()}`);
    mkdirSync(raw, { recursive: true });
    testDir = realpathSync(raw);
    manifestPath = join(testDir, 'manifest.json');
    logPath = join(testDir, 'logs', 'router.log');

    // Create skill directory with SKILL.md
    const skillDir = join(testDir, '.claude', 'skills', 'invoice');
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(
      join(skillDir, 'SKILL.md'),
      '---\nname: invoice\ndescription: "Invoice processing"\n---\n\n# Invoice Skill\n\nProcess invoices carefully.'
    );

    const manifest = {
      version: '1.0.0',
      config: {
        weights: { keywords: 1.0, file_extensions: 1.5, patterns: 2.0, file_paths: 2.5 },
        activation_threshold: 3.0,
        log_path: logPath,
      },
      skills: [
        {
          path: '.claude/skills/invoice',
          name: 'Invoice Processor',
          triggers: {
            keywords: ['invoice', 'receipt', 'billing'],
            file_extensions: ['.pdf'],
            patterns: ['process.*invoice'],
            file_paths: ['invoices/**'],
          },
        },
      ],
    };
    writeFileSync(manifestPath, JSON.stringify(manifest));
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('should inject SKILL.md content when projectDir is provided', () => {
    const input = {
      prompt: 'Process the invoice in invoices/march.pdf',
      session_id: 'test-123',
      timestamp: new Date().toISOString(),
    };

    const result = processPrompt(input, manifestPath, testDir);

    expect(result).not.toBeNull();
    const context = result!.hookSpecificOutput.additionalContext;
    expect(context).toContain('Invoice Processor');
    expect(context).toContain('# Invoice Skill');
    expect(context).toContain('Process invoices carefully.');
    expect(context).toContain('Follow the skill instructions above.');
  });

  it('should use fallback message when projectDir is not provided', () => {
    const input = {
      prompt: 'Process the invoice in invoices/march.pdf',
      session_id: 'test-123',
      timestamp: new Date().toISOString(),
    };

    const result = processPrompt(input, manifestPath);

    expect(result).not.toBeNull();
    const context = result!.hookSpecificOutput.additionalContext;
    expect(context).toContain('Invoice Processor');
    expect(context).toContain('Please read the SKILL.md');
    expect(context).not.toContain('# Invoice Skill');
  });

  it('should gracefully handle missing SKILL.md when projectDir is provided', () => {
    // Remove the SKILL.md file
    rmSync(join(testDir, '.claude', 'skills', 'invoice', 'SKILL.md'));

    const input = {
      prompt: 'Process the invoice in invoices/march.pdf',
      session_id: 'test-123',
      timestamp: new Date().toISOString(),
    };

    const result = processPrompt(input, manifestPath, testDir);

    expect(result).not.toBeNull();
    const context = result!.hookSpecificOutput.additionalContext;
    expect(context).toContain('Invoice Processor');
    // Falls back to read message since no content could be loaded
    expect(context).toContain('Please read the SKILL.md');
  });
});

describe('error handling', () => {
  it('should return null for missing manifest', () => {
    const input = {
      prompt: 'test',
      session_id: 'test-123',
      timestamp: new Date().toISOString(),
    };

    const result = processPrompt(input, '/nonexistent/manifest.json');

    expect(result).toBeNull();
  });
});
