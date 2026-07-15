import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  APPROACH_CHECK_MARKER,
  buildApproachFeedback,
  buildApproachMandate,
  evaluateApproachCheck,
  loadAgentApproaches,
} from '../src/approaches.js';
import { transcriptHasEdits } from '../src/archive.js';
import type { ApproachEntry } from '../src/types.js';

// --- Transcript line helpers ---

function toolUseLine(name: string, input: Record<string, unknown> = {}): string {
  return JSON.stringify({
    type: 'assistant',
    message: { content: [{ type: 'tool_use', name, input }] },
  });
}

const skillLine = (skill: string): string => toolUseLine('Skill', { skill });
const editLine = (): string => toolUseLine('Edit', { file_path: 'a.cs' });

const markerLine = (): string =>
  JSON.stringify({
    type: 'user',
    message: {
      content: [{ type: 'text', text: `${APPROACH_CHECK_MARKER} Approach compliance check: FAILED.` }],
    },
  });

const jsonl = (...lines: string[]): string => lines.join('\n') + '\n';

// --- Fixtures ---

const TDD: ApproachEntry = {
  name: 'tdd',
  directive: 'Write a failing test before any implementation change.',
  skill: 'grimoire.unit-testing-dotnet',
};

const DOCS_FIRST: ApproachEntry = {
  name: 'docs-first',
  directive: 'Update the relevant business-logic docs before changing behavior.',
};

const MODERN_CSHARP: ApproachEntry = {
  name: 'modern-csharp',
  directive: 'Use current C#/.NET idioms in every touched file.',
  skill: 'grimoire.modern-csharp',
};

describe('buildApproachMandate', () => {
  it('includes the agent type and every approach name and directive', () => {
    const mandate = buildApproachMandate('grimoire.csharp-coder', [TDD, DOCS_FIRST]);

    expect(mandate).toContain('grimoire.csharp-coder');
    expect(mandate).toContain('tdd');
    expect(mandate).toContain(TDD.directive);
    expect(mandate).toContain('docs-first');
    expect(mandate).toContain(DOCS_FIRST.directive);
  });

  it('instructs skill-backed approaches to invoke the Skill tool first', () => {
    const mandate = buildApproachMandate('grimoire.csharp-coder', [TDD]);

    expect(mandate).toContain('invoke the Skill tool');
    expect(mandate).toContain('with skill "grimoire.unit-testing-dotnet"');
  });

  it('has no required-skill line for directive-only approaches', () => {
    const mandate = buildApproachMandate('grimoire.csharp-coder', [DOCS_FIRST]);

    expect(mandate).not.toContain('Required skill');
    expect(mandate).not.toContain('Skill tool');
  });

  it('enumerates approaches in order', () => {
    const mandate = buildApproachMandate('grimoire.csharp-coder', [TDD, DOCS_FIRST]);

    expect(mandate).toContain('### 1. tdd');
    expect(mandate).toContain('### 2. docs-first');
    expect(mandate.indexOf('### 1. tdd')).toBeLessThan(mandate.indexOf('### 2. docs-first'));
  });

  it('does not contain the approach-check marker', () => {
    // The mandate lands in the transcript; if it contained the marker, the
    // stop check would treat every run as already bounced and self-disable.
    const mandate = buildApproachMandate('grimoire.csharp-coder', [TDD, DOCS_FIRST]);

    expect(mandate).not.toContain(APPROACH_CHECK_MARKER);
  });
});

describe('buildApproachFeedback', () => {
  it('starts with the approach-check marker', () => {
    const feedback = buildApproachFeedback([TDD]);

    expect(feedback.startsWith(APPROACH_CHECK_MARKER)).toBe(true);
  });

  it('names each violated approach and its required skill', () => {
    const feedback = buildApproachFeedback([TDD, MODERN_CSHARP]);

    expect(feedback).toContain('Approach "tdd" requires the skill "grimoire.unit-testing-dotnet"');
    expect(feedback).toContain('Approach "modern-csharp" requires the skill "grimoire.modern-csharp"');
  });

  it('contains the remediation steps', () => {
    const feedback = buildApproachFeedback([TDD]);

    expect(feedback).toContain('Invoke the Skill tool with skill "grimoire.unit-testing-dotnet"');
    expect(feedback).toContain('Review every edit');
    expect(feedback).toContain('Fix any violations');
    expect(feedback).toContain('Then finish');
  });
});

describe('evaluateApproachCheck', () => {
  it('skips when no approach is skill-backed', () => {
    const result = evaluateApproachCheck([DOCS_FIRST], jsonl(editLine()), 'success');

    expect(result).toEqual({ outcome: 'skipped', violated: [] });
  });

  it('skips for an empty approaches array', () => {
    const result = evaluateApproachCheck([], jsonl(editLine()), 'success');

    expect(result.outcome).toBe('skipped');
  });

  it('skips when stop_reason is cancelled', () => {
    const result = evaluateApproachCheck([TDD], jsonl(editLine()), 'cancelled');

    expect(result.outcome).toBe('skipped');
  });

  it('skips when stop_reason is error', () => {
    const result = evaluateApproachCheck([TDD], jsonl(editLine()), 'error');

    expect(result.outcome).toBe('skipped');
  });

  it('skips (fail-open) when the transcript is unavailable', () => {
    const result = evaluateApproachCheck([TDD], null, 'success');

    expect(result.outcome).toBe('skipped');
  });

  it('bounces when edits were made and the bound skill was never invoked', () => {
    const result = evaluateApproachCheck([TDD], jsonl(editLine()), 'success');

    expect(result.outcome).toBe('bounced');
    expect(result.violated).toEqual([TDD]);
  });

  it('bounces on Write edits', () => {
    const result = evaluateApproachCheck([TDD], jsonl(toolUseLine('Write', { file_path: 'a.cs' })), 'success');

    expect(result.outcome).toBe('bounced');
  });

  it('bounces on MultiEdit edits', () => {
    const result = evaluateApproachCheck([TDD], jsonl(toolUseLine('MultiEdit', { file_path: 'a.cs' })), 'success');

    expect(result.outcome).toBe('bounced');
  });

  it('passes when the bound skill was invoked in an editing run', () => {
    const result = evaluateApproachCheck(
      [TDD],
      jsonl(skillLine('grimoire.unit-testing-dotnet'), editLine()),
      'success',
    );

    expect(result).toEqual({ outcome: 'passed', violated: [] });
  });

  it('passes when the bound skill was invoked without edits', () => {
    const result = evaluateApproachCheck([TDD], jsonl(skillLine('grimoire.unit-testing-dotnet')), 'success');

    expect(result.outcome).toBe('passed');
  });

  it('skips a read-only run that never invoked the skill', () => {
    const result = evaluateApproachCheck([TDD], jsonl(toolUseLine('Read', { file_path: 'a.cs' })), 'success');

    expect(result.outcome).toBe('skipped');
  });

  it('skips when the marker is already in the transcript (one-bounce cap)', () => {
    const result = evaluateApproachCheck([TDD], jsonl(editLine(), markerLine()), 'success');

    expect(result.outcome).toBe('skipped');
  });

  it('passes when compliance happened after a bounce', () => {
    const result = evaluateApproachCheck(
      [TDD],
      jsonl(editLine(), markerLine(), skillLine('grimoire.unit-testing-dotnet')),
      'success',
    );

    expect(result.outcome).toBe('passed');
  });

  it('bounces with only the missing approaches when compliance is partial', () => {
    const result = evaluateApproachCheck(
      [TDD, MODERN_CSHARP],
      jsonl(skillLine('grimoire.modern-csharp'), editLine()),
      'success',
    );

    expect(result.outcome).toBe('bounced');
    expect(result.violated).toEqual([TDD]);
  });

  it('treats a shared bound skill as satisfying every approach bound to it', () => {
    const logging: ApproachEntry = {
      name: 'dotnet-compile-time-logging',
      directive: 'Use the LoggerMessage source generator for all logging.',
      skill: 'grimoire.modern-csharp',
    };

    const result = evaluateApproachCheck(
      [MODERN_CSHARP, logging],
      jsonl(skillLine('grimoire.modern-csharp'), editLine()),
      'success',
    );

    expect(result.outcome).toBe('passed');
  });

  it('ignores malformed transcript lines', () => {
    const text = ['not json at all', '{"broken":', jsonl(editLine()).trim(), '42'].join('\n');

    const result = evaluateApproachCheck([TDD], text, 'success');

    expect(result.outcome).toBe('bounced');
  });

  it('ignores tool_use-shaped content on non-assistant lines', () => {
    const fakeUserEdit = JSON.stringify({
      type: 'user',
      message: { content: [{ type: 'tool_use', name: 'Edit', input: { file_path: 'a.cs' } }] },
    });

    const result = evaluateApproachCheck([TDD], jsonl(fakeUserEdit), 'success');

    expect(result.outcome).toBe('skipped');
  });
});

describe('transcriptHasEdits', () => {
  it('detects Edit, Write, and MultiEdit tool use', () => {
    expect(transcriptHasEdits(jsonl(editLine()))).toBe(true);
    expect(transcriptHasEdits(jsonl(toolUseLine('Write')))).toBe(true);
    expect(transcriptHasEdits(jsonl(toolUseLine('MultiEdit')))).toBe(true);
  });

  it('returns false for runs without file-editing tools', () => {
    expect(transcriptHasEdits(jsonl(toolUseLine('Read'), skillLine('x')))).toBe(false);
    expect(transcriptHasEdits('')).toBe(false);
  });
});

describe('loadAgentApproaches', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `approaches-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(join(testDir, '.claude'), { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  function writeConfig(config: Record<string, unknown>): void {
    writeFileSync(join(testDir, '.claude', 'grimoire.json'), JSON.stringify(config));
  }

  it('returns the configured approaches for the agent', () => {
    writeConfig({
      router: {
        agents: { 'grimoire.csharp-coder': { approaches: [{ name: 'tdd', directive: 'Tests first.', skill: 's' }] } },
      },
    });

    expect(loadAgentApproaches(testDir, 'grimoire.csharp-coder')).toEqual([
      { name: 'tdd', directive: 'Tests first.', skill: 's' },
    ]);
  });

  it('filters malformed entries', () => {
    writeConfig({
      router: {
        agents: {
          'agent-a': { approaches: [{ name: 'no-directive' }, 'junk', { name: 'tdd', directive: 'Tests first.' }] },
        },
      },
    });

    expect(loadAgentApproaches(testDir, 'agent-a')).toEqual([{ name: 'tdd', directive: 'Tests first.' }]);
  });

  it('returns [] when the agent has no approaches', () => {
    writeConfig({ router: { agents: { 'agent-a': {} } } });

    expect(loadAgentApproaches(testDir, 'agent-a')).toEqual([]);
  });

  it('returns [] for an unknown agent', () => {
    writeConfig({ router: { agents: { 'agent-a': { approaches: [{ name: 'x', directive: 'y' }] } } } });

    expect(loadAgentApproaches(testDir, 'agent-b')).toEqual([]);
  });

  it('returns [] when the agents map is absent', () => {
    writeConfig({ router: {} });

    expect(loadAgentApproaches(testDir, 'agent-a')).toEqual([]);
  });

  it('returns [] when the router key is missing', () => {
    writeConfig({ enforcement: true });

    expect(loadAgentApproaches(testDir, 'agent-a')).toEqual([]);
  });

  it('returns [] when grimoire.json is missing', () => {
    expect(loadAgentApproaches(testDir, 'agent-a')).toEqual([]);
  });
});
