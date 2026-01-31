import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildLogEntry, writeLog } from '../src/logging.js';
import { readFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import type { SkillScoreResult, ExtractedSignals } from '../src/types.js';

describe('buildLogEntry', () => {
  const baseParams = {
    sessionId: 'test-session-123',
    promptRaw: 'Process the invoice',
    promptNormalized: 'process the invoice',
    signals: {
      words: new Set(['process', 'the', 'invoice']),
      extensions: new Set<string>(),
      paths: [],
    } as ExtractedSignals,
    skillsEvaluated: 5,
    matchedSkills: [] as SkillScoreResult[],
    threshold: 3.0,
    startTime: Date.now() - 10,
  };

  it('should build complete log entry with all fields', () => {
    const entry = buildLogEntry({ ...baseParams, outcome: 'no_match' });

    expect(entry.session_id).toBe('test-session-123');
    expect(entry.prompt_raw).toBe('Process the invoice');
    expect(entry.prompt_normalized).toBe('process the invoice');
    expect(entry.signals_extracted.words_count).toBe(3);
    expect(entry.skills_evaluated).toBe(5);
    expect(entry.threshold).toBe(3.0);
    expect(entry.outcome).toBe('no_match');
    expect(entry.execution_time_ms).toBeGreaterThanOrEqual(0);
  });

  it('should truncate prompt_raw at 500 characters', () => {
    const longPrompt = 'a'.repeat(600);
    const entry = buildLogEntry({
      ...baseParams,
      promptRaw: longPrompt,
      outcome: 'no_match',
    });

    expect(entry.prompt_raw.length).toBe(500);
  });

  it('should include timestamp in ISO format', () => {
    const entry = buildLogEntry({ ...baseParams, outcome: 'activated' });

    expect(entry.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('should include matched skills when activated', () => {
    const matchedSkills: SkillScoreResult[] = [
      {
        skill: { path: '/skills/test', name: 'Test Skill' },
        score: 5.0,
        matchedSignals: [{ type: 'keyword', value: 'invoice' }],
      },
    ];

    const entry = buildLogEntry({
      ...baseParams,
      matchedSkills,
      outcome: 'activated',
    });

    expect(entry.skills_matched).toHaveLength(1);
    expect(entry.skills_matched[0]?.name).toBe('Test Skill');
    expect(entry.skills_matched[0]?.score).toBe(5.0);
  });

  it('should calculate positive execution time', () => {
    const entry = buildLogEntry({ ...baseParams, outcome: 'no_match' });

    expect(entry.execution_time_ms).toBeGreaterThanOrEqual(0);
  });
});

describe('writeLog', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `skill-router-log-test-${Date.now()}`);
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should create log file if not exists', () => {
    const logPath = join(testDir, 'logs', 'test.log');
    const entry = { test: 'data', timestamp: new Date().toISOString() };

    writeLog(entry, logPath);

    expect(existsSync(logPath)).toBe(true);
  });

  it('should create directory if not exists', () => {
    const logPath = join(testDir, 'deep', 'nested', 'dir', 'test.log');
    const entry = { test: 'data', timestamp: new Date().toISOString() };

    writeLog(entry, logPath);

    expect(existsSync(logPath)).toBe(true);
  });

  it('should append JSON line to log file', () => {
    const logPath = join(testDir, 'test.log');
    const entry1 = { id: 1, timestamp: new Date().toISOString() };
    const entry2 = { id: 2, timestamp: new Date().toISOString() };

    writeLog(entry1, logPath);
    writeLog(entry2, logPath);

    const content = readFileSync(logPath, 'utf-8');
    const lines = content.trim().split('\n');

    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0] ?? '').id).toBe(1);
    expect(JSON.parse(lines[1] ?? '').id).toBe(2);
  });

  it('should not throw on write failure', () => {
    // Write to an invalid path (root directory)
    const invalidPath = '/root/cannot/write/here.log';

    expect(() => {
      writeLog({ test: 'data' }, invalidPath);
    }).not.toThrow();
  });
});
