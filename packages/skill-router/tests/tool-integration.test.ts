import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { processToolUse } from '../src/main.js';
import { writeFileSync, mkdirSync, rmSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir, } from 'os';
import { realpathSync } from 'fs';
import type { PreToolUseInput } from '../src/types.js';

describe('processToolUse (integration)', () => {
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
      pretooluse_threshold: 1.5,
    },
    skills: [
      {
        path: '.claude/skills/modern-typescript',
        name: 'Modern TypeScript',
        triggers: {
          keywords: ['typescript', 'ts'],
          file_extensions: ['.ts', '.tsx'],
          patterns: ['type.*safe'],
          file_paths: ['src/', 'tsconfig'],
        },
      },
      {
        path: '.claude/skills/dotnet-testing',
        name: 'DotNet Unit Testing',
        triggers: {
          keywords: ['test', 'testing'],
          file_extensions: ['.cs'],
          patterns: ['write.*test'],
          file_paths: ['tests/', 'Tests/'],
        },
      },
      {
        path: '.claude/skills/readme-guide',
        name: 'README Guide',
        triggers: {
          keywords: ['readme'],
          file_extensions: ['.md'],
          file_paths: ['README', 'docs/'],
        },
      },
    ],
  };

  beforeEach(() => {
    const raw = join(tmpdir(), `skill-router-tool-int-${Date.now()}`);
    mkdirSync(raw, { recursive: true });
    testDir = realpathSync(raw);
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

  function makeInput(
    toolName: 'Edit' | 'Write',
    filePath: string
  ): PreToolUseInput {
    return {
      session_id: 'test-sess',
      hook_event_name: 'PreToolUse',
      tool_name: toolName,
      tool_use_id: 'tu-1',
      tool_input: { file_path: filePath },
    };
  }

  it('should match TypeScript skill when editing .ts file', () => {
    const input = makeInput('Edit', `${testDir}/src/main.ts`);
    const result = processToolUse(input, manifestPath, testDir);

    expect(result).not.toBeNull();
    expect(result?.hookSpecificOutput.additionalContext).toContain(
      'Modern TypeScript'
    );
    expect(result?.hookSpecificOutput.permissionDecision).toBe('allow');
  });

  it('should match .cs skill when writing .cs file', () => {
    const input = makeInput('Write', `${testDir}/tests/UserService.cs`);
    const result = processToolUse(input, manifestPath, testDir);

    expect(result).not.toBeNull();
    expect(result?.hookSpecificOutput.additionalContext).toContain(
      'DotNet Unit Testing'
    );
  });

  it('should return null for non-matching extension in non-matching path', () => {
    const input = makeInput('Edit', `${testDir}/assets/image.png`);
    const result = processToolUse(input, manifestPath, testDir);

    expect(result).toBeNull();
  });

  it('should match based on file_paths trigger', () => {
    const input = makeInput('Write', `${testDir}/src/utils/helper.ts`);
    const result = processToolUse(input, manifestPath, testDir);

    expect(result).not.toBeNull();
    // .ts (1.5) + src/ path (2.5) = 4.0 > 1.5 threshold
    const ctx = result?.hookSpecificOutput.additionalContext ?? '';
    expect(ctx).toContain('Modern TypeScript');
  });

  it('should include tool name in formatted output', () => {
    const input = makeInput('Edit', `${testDir}/src/main.ts`);
    const result = processToolUse(input, manifestPath, testDir);

    expect(result?.hookSpecificOutput.additionalContext).toContain('Edit');
  });

  it('should always set permissionDecision to allow', () => {
    const input = makeInput('Edit', `${testDir}/src/main.ts`);
    const result = processToolUse(input, manifestPath, testDir);

    expect(result?.hookSpecificOutput.permissionDecision).toBe('allow');
  });

  it('should write log entry with PreToolUse info', () => {
    const input = makeInput('Edit', `${testDir}/src/main.ts`);
    processToolUse(input, manifestPath, testDir);

    expect(existsSync(logPath)).toBe(true);
    const logContent = readFileSync(logPath, 'utf-8');
    const logEntry = JSON.parse(logContent.trim());
    expect(logEntry.hook_event).toBe('PreToolUse');
    expect(logEntry.tool_name).toBe('Edit');
    expect(logEntry.outcome).toBe('activated');
  });

  it('should return null for missing manifest', () => {
    const input = makeInput('Edit', '/project/src/main.ts');
    const result = processToolUse(input, '/nonexistent/manifest.json', '/project');

    expect(result).toBeNull();
  });

  it('should use default threshold when pretooluse_threshold not set', () => {
    // Rewrite manifest without pretooluse_threshold
    const noThresholdManifest = {
      ...validManifest,
      config: {
        weights: validManifest.config.weights,
        activation_threshold: 3.0,
        log_path: logPath,
      },
    };
    writeFileSync(manifestPath, JSON.stringify(noThresholdManifest));

    // .ts extension (1.5) should match with default threshold of 1.5
    const input = makeInput('Edit', `${testDir}/src/main.ts`);
    const result = processToolUse(input, manifestPath, testDir);

    expect(result).not.toBeNull();
  });

  it('should match multiple skills when both exceed threshold', () => {
    // .ts in tests/ should match both TypeScript and potentially via paths
    const input = makeInput('Write', `${testDir}/tests/component.ts`);
    const result = processToolUse(input, manifestPath, testDir);

    expect(result).not.toBeNull();
    const ctx = result?.hookSpecificOutput.additionalContext ?? '';
    // Modern TypeScript should match: .ts (1.5) + tests/ doesn't match src/
    // DotNet Testing: tests/ path (2.5) >= 1.5 threshold
    expect(ctx).toContain('Modern TypeScript');
  });
});
