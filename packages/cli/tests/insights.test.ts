import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { gzipSync } from 'zlib';
import {
  defaultArchiveRoot,
  findSessionRef,
  listArchivedSubagentFiles,
  loadMergedInvocations,
  parseInvocation,
  readSessionAnalysis,
  readTranscriptText,
  sessionAnalysisPaths,
  writeSessionAnalysis,
  type InvocationProfile,
} from '../src/transcripts.js';
import { aggregate, analyze, parseGrantedTools, enforceContextFromLog } from '../src/insights-analysis.js';
import { allocateRunBudgets, buildEvidencePrompt, renderRunNarrative } from '../src/agent-analysis.js';
import type { ToolEvent } from '../src/transcripts.js';

// =============================================================================
// parseInvocation — defensive extraction from a sub-agent transcript
// =============================================================================

function line(obj: unknown): string {
  return JSON.stringify(obj);
}

describe('parseInvocation', () => {
  const jsonl = [
    line({ type: 'user', timestamp: '2026-07-01T09:59:59.000Z', message: { role: 'user', content: [{ type: 'text', text: 'Refactor a.ts to remove any' }] } }),
    line({
      type: 'assistant',
      timestamp: '2026-07-01T10:00:00.000Z',
      message: {
        model: 'claude-opus-4-8',
        usage: { input_tokens: 10, cache_read_input_tokens: 100, cache_creation_input_tokens: 50, output_tokens: 30 },
        content: [
          { type: 'text', text: 'working' },
          { type: 'tool_use', name: 'Read', input: { file_path: 'a.ts' } },
        ],
      },
    }),
    line({ type: 'user', timestamp: '2026-07-01T10:00:01.000Z', toolUseResult: 'file contents' }),
    line({
      type: 'assistant',
      timestamp: '2026-07-01T10:00:05.000Z',
      message: { model: 'claude-opus-4-8', usage: { output_tokens: 20 }, content: [{ type: 'tool_use', name: 'Edit', input: { file_path: 'a.ts' } }] },
    }),
    line({ type: 'user', timestamp: '2026-07-01T10:00:06.000Z', toolUseResult: { interrupted: false, stderr: '' } }),
    line({
      type: 'assistant',
      timestamp: '2026-07-01T10:00:08.000Z',
      message: { usage: { output_tokens: 5 }, content: [{ type: 'tool_use', name: 'Edit', input: { file_path: 'a.ts' } }] },
    }),
    line({ type: 'user', timestamp: '2026-07-01T10:00:09.000Z', toolUseResult: { interrupted: true, stderr: 'boom' } }),
    line({ type: 'assistant', timestamp: '2026-07-01T10:00:10.000Z', message: { content: [{ type: 'text', text: 'done, final result' }] } }),
    'not json at all', // malformed line
  ].join('\n');

  const inv = parseInvocation('ag-1', 'sess-1', jsonl, { agentType: 'grimoire.typescript-coder', description: 'do ts' });

  it('extracts identity, task and outcome', () => {
    expect(inv.agentId).toBe('ag-1');
    expect(inv.agentType).toBe('grimoire.typescript-coder');
    expect(inv.model).toBe('claude-opus-4-8');
    expect(inv.taskPrompt).toBe('Refactor a.ts to remove any');
    expect(inv.finalText).toBe('done, final result');
    expect(inv.completed).toBe(true);
  });

  it('counts tools, turns and files', () => {
    expect(inv.turns).toBe(4);
    expect(inv.toolCalls).toBe(3);
    expect(inv.toolCounts).toEqual({ Read: 1, Edit: 2 });
    expect(inv.filesTouched).toEqual(['a.ts', 'a.ts']);
    expect(inv.maxFileEdits).toBe(2);
  });

  it('sums all token fields', () => {
    expect(inv.tokens.output).toBe(55);
    expect(inv.tokens.total).toBe(215);
  });

  it('detects tool errors from object-form results only', () => {
    expect(inv.toolErrors).toBe(1);
  });

  it('computes span and tolerates malformed lines', () => {
    expect(inv.spanMs).toBe(11000);
    expect(inv.parseErrors).toBe(1);
  });

  it('never throws on empty input', () => {
    expect(() => parseInvocation('x', 'y', '', {})).not.toThrow();
    const empty = parseInvocation('x', 'y', '\n\n', {});
    expect(empty.turns).toBe(0);
    expect(empty.agentType).toBe('unknown');
  });

  it('captures tool targets and marks the fallback-heuristic error on the last event', () => {
    expect(inv.toolEvents.map((e) => ({ name: e.name, target: e.target }))).toEqual([
      { name: 'Read', target: 'a.ts' },
      { name: 'Edit', target: 'a.ts' },
      { name: 'Edit', target: 'a.ts' },
    ]);
    // the interrupted/stderr result follows the last Edit
    expect(inv.toolEvents[2]!.isError).toBe(true);
    expect(inv.toolEvents[0]!.isError).toBe(false);
  });
});

// =============================================================================
// parseInvocation — repo-root-relative file targets
// =============================================================================

describe('parseInvocation repo-relative targets', () => {
  const CWD = '/repo/root';
  const jsonl = [
    // cwd appears only on the first line — later tool_use lines must inherit it
    line({ type: 'user', cwd: CWD, timestamp: '2026-07-01T10:00:00.000Z', message: { role: 'user', content: [{ type: 'text', text: 'edit files' }] } }),
    line({
      type: 'assistant',
      timestamp: '2026-07-01T10:00:01.000Z',
      message: {
        content: [
          { type: 'tool_use', name: 'Write', input: { file_path: '/repo/root/src/x.ts', content: 'x' } },
          { type: 'tool_use', name: 'Edit', input: { file_path: '/repo/root/pkg/a/b.ts', old_string: 'a', new_string: 'b' } },
          { type: 'tool_use', name: 'Write', input: { file_path: '/tmp/out.log', content: 'log' } },
          { type: 'tool_use', name: 'Read', input: { file_path: '/somewhere/else/out.ts' } },
          { type: 'tool_use', name: 'Bash', input: { command: 'ls -la\nmore' } },
          { type: 'tool_use', name: 'Glob', input: { pattern: '**/*.ts', path: '/repo/root/src' } },
        ],
      },
    }),
  ].join('\n');

  const inv = parseInvocation('ag-rel', 'sess-1', jsonl, { agentType: 'X' });
  // toolEvents order: [Write in-repo, Edit in-repo, Write outside, Read outside, Bash, Glob]
  const targets = inv.toolEvents.map((e) => e.target);

  it('shows in-repo file_path targets relative to the repo root', () => {
    expect(targets[0]).toBe('src/x.ts');
    expect(targets[1]).toBe('pkg/a/b.ts');
  });

  it('keeps file_path targets outside the repo absolute', () => {
    expect(targets[2]).toBe('/tmp/out.log'); // Write outside the repo
    expect(targets[3]).toBe('/somewhere/else/out.ts'); // Read outside the repo
  });

  it('leaves non-file targets (bash command, glob pattern) verbatim', () => {
    expect(targets[4]).toBe('ls -la');
    expect(targets[5]).toBe('**/*.ts'); // pattern beats path, unchanged
  });

  it('records filesTouched relative to the repo root (absolute when outside)', () => {
    expect(inv.filesTouched).toEqual(['src/x.ts', 'pkg/a/b.ts', '/tmp/out.log']);
  });
});

// =============================================================================
// parseInvocation — is_error correlation + reasoning snippets
// =============================================================================

describe('parseInvocation error correlation', () => {
  const jsonl = [
    line({ type: 'user', timestamp: '2026-07-01T10:00:00.000Z', message: { role: 'user', content: [{ type: 'text', text: 'fix the config' }] } }),
    line({
      type: 'assistant',
      timestamp: '2026-07-01T10:00:01.000Z',
      message: {
        model: 'claude-haiku-4-5',
        content: [
          { type: 'text', text: 'Let me start by reading the config' },
          { type: 'tool_use', id: 'tu1', name: 'Read', input: { file_path: 'cfg.json' } },
        ],
      },
    }),
    line({
      type: 'user',
      timestamp: '2026-07-01T10:00:02.000Z',
      message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tu1', is_error: true, content: 'File does not exist. Did you mean config.json?' }] },
    }),
    line({
      type: 'assistant',
      timestamp: '2026-07-01T10:00:03.000Z',
      message: {
        content: [
          { type: 'text', text: 'Read failed, listing the directory instead' },
          { type: 'tool_use', id: 'tu2', name: 'Bash', input: { command: 'ls -la\necho done' } },
        ],
      },
    }),
    line({
      type: 'user',
      timestamp: '2026-07-01T10:00:04.000Z',
      message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tu2', content: [{ type: 'text', text: 'config.json' }] }] },
    }),
    line({ type: 'assistant', timestamp: '2026-07-01T10:00:05.000Z', message: { content: [{ type: 'text', text: 'Fixed it, all done' }] } }),
  ].join('\n');

  const inv = parseInvocation('ag-2', 'sess-1', jsonl, { agentType: 'X' });

  it('correlates is_error results to the exact tool call and keeps the error text', () => {
    expect(inv.toolEvents).toHaveLength(2);
    expect(inv.toolEvents[0]).toMatchObject({ name: 'Read', target: 'cfg.json', isError: true });
    expect(inv.toolEvents[0]!.errorText).toContain('File does not exist');
    expect(inv.toolEvents[1]!.isError).toBe(false);
    expect(inv.toolErrors).toBe(1);
  });

  it('uses the first line of a Bash command as the target', () => {
    expect(inv.toolEvents[1]!.target).toBe('ls -la');
  });

  it('keeps intermediate reasoning snippets, not the final text', () => {
    expect(inv.reasoningSnippets).toContain('Let me start by reading the config');
    expect(inv.reasoningSnippets).not.toContain('Fixed it, all done');
    expect(inv.reasoningSnippets.length).toBeLessThanOrEqual(3);
    expect(inv.finalText).toBe('Fixed it, all done');
  });
});

// =============================================================================
// parseInvocation — chronological timeline (thinking + text + tools)
// =============================================================================

describe('parseInvocation timeline', () => {
  const jsonl = [
    line({ type: 'user', timestamp: '2026-07-01T10:00:00.000Z', message: { role: 'user', content: [{ type: 'text', text: 'fix the build' }] } }),
    line({
      type: 'assistant',
      timestamp: '2026-07-01T10:00:01.000Z',
      message: {
        content: [
          { type: 'thinking', thinking: 'Planning the approach', signature: 'sig' },
          { type: 'text', text: 'Let me read the config' },
          { type: 'tool_use', id: 'tu1', name: 'Read', input: { file_path: 'cfg.json' } },
        ],
      },
    }),
    line({
      type: 'user',
      timestamp: '2026-07-01T10:00:02.000Z',
      message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tu1', is_error: true, content: 'File does not exist' }] },
    }),
    line({
      type: 'assistant',
      timestamp: '2026-07-01T10:00:03.000Z',
      message: {
        content: [
          { type: 'thinking', thinking: 'That failed, listing instead' },
          { type: 'tool_use', id: 'tu2', name: 'Bash', input: { command: 'ls' } },
        ],
      },
    }),
    line({
      type: 'user',
      timestamp: '2026-07-01T10:00:04.000Z',
      message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tu2', content: [{ type: 'text', text: 'config.json' }] }] },
    }),
    line({
      type: 'assistant',
      timestamp: '2026-07-01T10:00:05.000Z',
      message: {
        content: [
          { type: 'redacted_thinking', data: 'xxx' },
          { type: 'text', text: 'Fixed it, all done' },
        ],
      },
    }),
  ].join('\n');

  const inv = parseInvocation('ag-tl', 'sess-1', jsonl, { agentType: 'X' });

  it('records thinking, text and tool items in chronological order', () => {
    const shape = inv.timeline.map((it) =>
      it.kind === 'tool' ? `tool:${it.event.name}` : `${it.kind}:${it.text}`,
    );
    expect(shape).toEqual([
      'thinking:Planning the approach',
      'text:Let me read the config',
      'tool:Read',
      'thinking:That failed, listing instead',
      'tool:Bash',
      'text:Fixed it, all done',
    ]);
  });

  it('reuses the ToolEvent reference so error correlation shows in the timeline', () => {
    const readItem = inv.timeline.find((it) => it.kind === 'tool' && it.event.name === 'Read');
    expect(readItem?.kind).toBe('tool');
    if (readItem?.kind === 'tool') {
      expect(readItem.event.isError).toBe(true);
      expect(readItem.event.errorText).toContain('File does not exist');
      // same object identity as the summary toolEvents entry
      expect(readItem.event).toBe(inv.toolEvents[0]);
    }
  });

  it('skips redacted_thinking and thinking blocks with no text without throwing', () => {
    expect(inv.timeline.some((it) => it.kind === 'thinking' && it.text === 'xxx')).toBe(false);
    expect(() => parseInvocation('x', 'y', line({ type: 'assistant', message: { content: [{ type: 'thinking' }, { type: 'redacted_thinking', data: 'z' }] } }), {})).not.toThrow();
  });

  it('caps each thinking/text item at 2000 chars', () => {
    const big = 'a'.repeat(5000);
    const one = parseInvocation('x', 'y', line({ type: 'assistant', message: { content: [{ type: 'thinking', thinking: big }] } }), {});
    const item = one.timeline[0];
    expect(item?.kind).toBe('thinking');
    if (item?.kind === 'thinking') expect(item.text.length).toBe(2000);
  });

  it('leaves the existing summary fields intact alongside the timeline', () => {
    expect(inv.toolSequence).toEqual(['Read', 'Bash']);
    expect(inv.finalText).toBe('Fixed it, all done');
    expect(inv.reasoningSnippets).toContain('Let me read the config');
  });
});

// =============================================================================
// aggregate / analyze
// =============================================================================

function mkInv(over: Partial<InvocationProfile>): InvocationProfile {
  return {
    agentId: 'a', agentType: 'X', description: '', sessionId: 's', model: 'claude-opus-4-8',
    toolCounts: {}, toolSequence: [], toolCalls: 0, turns: 0,
    tokens: { output: 0, input: 0, cacheRead: 0, cacheCreation: 0, total: 0 },
    firstTs: null, lastTs: null, spanMs: 0, toolErrors: 0, filesTouched: [], maxFileEdits: 0,
    toolEvents: [], reasoningSnippets: [], timeline: [],
    taskPrompt: '', finalText: '', completed: true, parseErrors: 0, ...over,
  };
}

describe('aggregate', () => {
  it('rolls up invocations of the same agent type', () => {
    const invs = [
      mkInv({ agentType: 'coder', toolCounts: { Read: 3, Edit: 1 }, toolCalls: 4, turns: 10, tokens: { output: 100, input: 0, cacheRead: 0, cacheCreation: 0, total: 100 }, completed: true, filesTouched: ['a.ts'] }),
      mkInv({ agentType: 'coder', toolCounts: { Read: 1, Bash: 2 }, toolCalls: 3, turns: 6, tokens: { output: 50, input: 0, cacheRead: 0, cacheCreation: 0, total: 50 }, completed: false, filesTouched: ['b.ts'] }),
    ];
    const [p] = aggregate(invs);
    expect(p!.invocations).toBe(2);
    expect(p!.toolMix).toEqual({ Read: 4, Edit: 1, Bash: 2 });
    expect(p!.avgToolCalls).toBe(3.5);
    expect(p!.totalOutputTokens).toBe(150);
    expect(p!.distinctFiles).toBe(2);
    expect(p!.incompleteRate).toBe(0.5);
  });
});

describe('analyze', () => {
  it('sorts agents by attention (noisiest first)', () => {
    const invs = [
      mkInv({ agentType: 'flaky', toolCalls: 2, turns: 40, toolErrors: 5, completed: false }),
      mkInv({ agentType: 'clean', toolCalls: 2, turns: 3, completed: true }),
    ];
    const profiles = analyze(invs);
    expect(profiles[0]!.agentType).toBe('flaky');
    expect(profiles[0]!.attention).toBeGreaterThan(profiles[1]!.attention);
  });
});

// =============================================================================
// context helpers
// =============================================================================

describe('parseGrantedTools', () => {
  it('parses inline CSV form', () => {
    expect(parseGrantedTools('---\nname: x\ntools: Read, Edit, Bash\n---\nbody')).toEqual(['Read', 'Edit', 'Bash']);
  });

  it('parses YAML list form', () => {
    expect(parseGrantedTools('---\nname: x\ntools:\n  - Read\n  - Edit\nmodel: opus\n---\nbody')).toEqual(['Read', 'Edit']);
  });

  it('returns empty when no tools key', () => {
    expect(parseGrantedTools('---\nname: x\n---\n')).toEqual([]);
  });
});

describe('enforceContextFromLog', () => {
  it('counts out-of-lane blocks per sub-agent and ignores main thread', () => {
    const log = [
      '{"enforce_block":true,"agent_type":"grimoire.csharp-coder","file_basename":"a.ts"}',
      '{"enforce_block":true,"agent_type":"grimoire.csharp-coder","file_basename":"b.ts"}',
      '{"enforce_block":true,"agent_type":null,"file_basename":"c.ts"}',
      'garbage',
    ].join('\n');
    const ctx = enforceContextFromLog(log);
    expect(ctx['grimoire.csharp-coder']!.outOfLaneBlocks).toBe(2);
    expect(ctx['grimoire.csharp-coder']!.outOfLaneFiles).toEqual(['a.ts', 'b.ts']);
    expect(Object.keys(ctx)).toEqual(['grimoire.csharp-coder']);
  });
});

// =============================================================================
// buildEvidencePrompt — the pack fed to the LLM (pure; no model call)
// =============================================================================

describe('buildEvidencePrompt', () => {
  const invs = Array.from({ length: 9 }, (_, i) => mkInv({
    agentType: 'grimoire.typescript-coder',
    taskPrompt: `task number ${i}`,
    toolCounts: { Read: 3, Edit: 1 },
    toolSequence: ['Read', 'Read', 'Read', 'Edit'],
    toolEvents: [
      { name: 'Read', target: 'a.ts', isError: false },
      { name: 'Read', target: 'a.ts', isError: false },
      { name: 'Read', target: 'b.ts', isError: true, errorText: 'File does not exist.' },
      { name: 'Edit', target: 'a.ts', isError: false },
    ],
    reasoningSnippets: ['I will read the file first'],
    toolCalls: 4, turns: 6, toolErrors: 1, filesTouched: ['a.ts'], spanMs: 250_000,
    firstTs: `2026-07-0${i + 1}T10:00:00.000Z`,
  }));

  it('embeds the definition, tools, evidence and the reviewer instructions', () => {
    const prompt = buildEvidencePrompt('grimoire.typescript-coder', '---\nname: x\n---\nSystem prompt body.', invs, { grantedTools: ['Read', 'Edit', 'Bash'], outOfLaneBlocks: 3, outOfLaneFiles: ['x.cs'] });
    expect(prompt).toContain('grimoire.typescript-coder');
    expect(prompt).toContain('System prompt body.');
    expect(prompt).toContain('Granted tools (frontmatter): Read, Edit, Bash');
    expect(prompt).toContain('blocked 3×');
    expect(prompt).toContain('Read×3, Edit×1');
    expect(prompt).toContain('Your task');
    expect(prompt).toMatch(/lever/i);
  });

  it('renders tool targets, error marks and reasoning excerpts in the run trace', () => {
    const prompt = buildEvidencePrompt('grimoire.typescript-coder', null, invs);
    expect(prompt).toContain('Read(a.ts)');
    expect(prompt).toContain('Read(b.ts)⚠');
    expect(prompt).toContain('File does not exist.');
    expect(prompt).toContain('I will read the file first');
    expect(prompt).toMatch(/4m1\ds wall-clock/);
  });

  it('asks for the three-section review with frequency and confidence discipline', () => {
    const prompt = buildEvidencePrompt('grimoire.typescript-coder', null, invs);
    expect(prompt).toContain('## How this agent behaves');
    expect(prompt).toContain('## Working well');
    expect(prompt).toContain('## Suggestions');
    expect(prompt).toMatch(/confidence/i);
    expect(prompt).toMatch(/\d\/6 runs/);
    expect(prompt).toMatch(/small sample/i);
  });

  it('requires observed cost per suggestion and filters out low-confidence polish', () => {
    const prompt = buildEvidencePrompt('grimoire.typescript-coder', null, invs);
    expect(prompt).toMatch(/observed cost/i);
    expect(prompt).toContain('Confidence: high|medium');
    expect(prompt).not.toMatch(/high\|medium\|low/);
    expect(prompt).toMatch(/omit/i);
    // The formatting example must not be a plausible generic suggestion the
    // model can parrot back for any agent (it did, with "single-purpose Bash").
    expect(prompt).not.toMatch(/single-purpose/i);
    expect(prompt).not.toMatch(/never chain commands/i);
  });

  it('caps the number of runs, states the selection window and notes built-in agents', () => {
    const prompt = buildEvidencePrompt('Explore', null, invs);
    expect(prompt).toContain('Built-in agent');
    // 9 invocations but capped at the 6 most recent
    expect(prompt).toContain('Observed runs (the 6 most recent of 9 recorded)');
  });

  it('renders the selected runs oldest → newest so the reviewer can read the trend', () => {
    // firstTs runs 2026-07-01 .. 2026-07-09; the 6 most recent are tasks 3..8.
    const prompt = buildEvidencePrompt('grimoire.typescript-coder', null, invs);
    expect(prompt).not.toContain('task number 2'); // outside the recent window
    const oldest = prompt.indexOf('task number 3'); // oldest of the window → first
    const newest = prompt.indexOf('task number 8'); // newest of the window → last
    expect(oldest).toBeGreaterThan(-1);
    expect(newest).toBeGreaterThan(oldest);
  });
});

// =============================================================================
// allocateRunBudgets — weighting unhealthy runs for the narrative
// =============================================================================

describe('allocateRunBudgets', () => {
  it('splits the budget evenly across healthy runs', () => {
    const runs = [mkInv({ completed: true }), mkInv({ completed: true })];
    expect(allocateRunBudgets(runs, 1000)).toEqual([500, 500]);
  });

  it('gives unhealthy runs (errors or unfinished) double weight', () => {
    const runs = [mkInv({ toolErrors: 1 }), mkInv({ completed: false, finalText: '' }), mkInv({ completed: true })];
    // weights 2, 2, 1 → sum 5 over 1000
    expect(allocateRunBudgets(runs, 1000)).toEqual([400, 400, 200]);
  });

  it('gives a single run the whole budget', () => {
    expect(allocateRunBudgets([mkInv({})], 24000)).toEqual([24000]);
  });

  it('returns empty for no runs', () => {
    expect(allocateRunBudgets([], 24000)).toEqual([]);
  });
});

// =============================================================================
// renderRunNarrative — one run's chronological thought→action→result trace
// =============================================================================

function tool(name: string, target: string | undefined, isError = false, errorText?: string): ToolEvent {
  return { name, target, isError, errorText };
}

describe('renderRunNarrative', () => {
  it('renders header, task, interleaved trace and a separate outcome line', () => {
    const inv = mkInv({
      turns: 5, toolCalls: 1, completed: true, spanMs: 40000,
      taskPrompt: 'fix the build', finalText: 'Done, all tests pass',
      timeline: [
        { kind: 'thinking', text: 'planning the fix' },
        { kind: 'text', text: 'let me read the config' },
        { kind: 'tool', event: tool('Read', 'a.ts') },
        { kind: 'text', text: 'Done, all tests pass' },
      ],
    });
    const out = renderRunNarrative(inv, 0, 24000);
    expect(out).toContain('### Run 1');
    expect(out).toContain('Task: fix the build');
    expect(out).toContain('[thought] "planning the fix"');
    expect(out).toContain('[tool] Read(a.ts)');
    expect(out).toContain('[outcome] "Done, all tests pass"');
    // the final text is the outcome, not duplicated as a trace line
    expect(out).not.toContain('[text] "Done, all tests pass"');
  });

  it('always renders errored tools and the reasoning immediately preceding them, even on a tiny budget', () => {
    const inv = mkInv({
      toolErrors: 1, completed: true, finalText: 'done',
      timeline: [
        { kind: 'thinking', text: 'the plan' },
        { kind: 'text', text: 'noise '.repeat(80) },
        { kind: 'thinking', text: 'this path is wrong because it moved' },
        { kind: 'tool', event: tool('Bash', 'pnpm test', true, 'Cannot find module foo') },
        { kind: 'text', text: 'done' },
      ],
    });
    const out = renderRunNarrative(inv, 0, 150); // too small for the noise
    expect(out).toContain('this path is wrong because it moved');
    expect(out).toContain('[tool] Bash(pnpm test) ⚠ error: Cannot find module foo');
    expect(out).not.toContain('noise noise');
  });

  it('elides skipped fill reasoning with a marker', () => {
    const inv = mkInv({
      completed: true, finalText: 'done',
      timeline: [
        { kind: 'thinking', text: 'the plan' },
        { kind: 'text', text: 'A'.repeat(390) },
        { kind: 'text', text: 'B'.repeat(390) },
        { kind: 'text', text: 'C'.repeat(390) },
        { kind: 'text', text: 'done' },
      ],
    });
    const out = renderRunNarrative(inv, 0, 200); // only the plan fits
    expect(out).toMatch(/\(\d+ reasoning blocks elided\)/);
  });

  it('caps the error text on a tool line to keep it under ~200 chars', () => {
    const inv = mkInv({
      toolErrors: 1, completed: true, finalText: 'done',
      timeline: [
        { kind: 'thinking', text: 'plan' },
        { kind: 'tool', event: tool('Bash', undefined, true, 'e'.repeat(500)) },
        { kind: 'text', text: 'done' },
      ],
    });
    const out = renderRunNarrative(inv, 0, 24000);
    const errLine = out.split('\n').find((l) => l.includes('⚠ error'))!;
    expect(errLine.length).toBeLessThanOrEqual(200);
  });
});

// =============================================================================
// buildEvidencePrompt — interleaved narrative + legacy fallback
// =============================================================================

describe('buildEvidencePrompt narrative', () => {
  const narrativeInvs = [mkInv({
    agentType: 'grimoire.typescript-coder', taskPrompt: 'wire up caching', completed: true,
    toolErrors: 1, spanMs: 60000, finalText: 'Cache added, tests green',
    firstTs: '2026-07-08T10:00:00.000Z',
    timeline: [
      { kind: 'thinking', text: 'I should check the existing cache util first' },
      { kind: 'tool', event: tool('Read', 'cache.ts') },
      { kind: 'thinking', text: 'the import moved, this will fail' },
      { kind: 'tool', event: tool('Bash', 'pnpm test', true, 'Cannot find module ./old') },
      { kind: 'tool', event: tool('Edit', 'cache.ts') },
      { kind: 'text', text: 'Cache added, tests green' },
    ],
  })];

  it('renders an interleaved thought→action narrative instead of the flat tool-order line', () => {
    const prompt = buildEvidencePrompt('grimoire.typescript-coder', null, narrativeInvs);
    expect(prompt).toContain('[thought] "I should check the existing cache util first"');
    expect(prompt).toContain('[tool] Read(cache.ts)');
    expect(prompt).toContain('[tool] Bash(pnpm test) ⚠ error: Cannot find module ./old');
    expect(prompt).toContain('[outcome] "Cache added, tests green"');
    // the old flat "A → B → C" tool-order line is gone for timeline-backed runs
    expect(prompt).not.toContain('Tool order:');
  });

  it('keeps the three-section review contract', () => {
    const prompt = buildEvidencePrompt('grimoire.typescript-coder', null, narrativeInvs);
    expect(prompt).toContain('## How this agent behaves');
    expect(prompt).toContain('## Suggestions');
    expect(prompt).toMatch(/observed cost/i);
  });

  it('stays in a single-prompt size envelope for six timeline-heavy runs', () => {
    const fat = Array.from({ length: 6 }, (_, i) => mkInv({
      agentType: 'grimoire.typescript-coder', completed: true, toolErrors: i % 2,
      firstTs: `2026-07-0${i + 1}T10:00:00.000Z`, finalText: 'done',
      timeline: [
        { kind: 'thinking', text: 'x'.repeat(1500) },
        { kind: 'tool', event: tool('Read', 'a.ts') },
        { kind: 'thinking', text: 'y'.repeat(1500) },
        { kind: 'tool', event: tool('Edit', 'a.ts') },
        { kind: 'text', text: 'z'.repeat(1500) },
        { kind: 'text', text: 'done' },
      ],
    }));
    const prompt = buildEvidencePrompt('grimoire.typescript-coder', null, fat);
    expect(prompt.length).toBeLessThan(32000);
  });
});

// =============================================================================
// Archive discovery + merged loading (live + gzipped archive)
// =============================================================================

function tmpRoot(label: string): string {
  const raw = join(tmpdir(), `grimoire-merge-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(raw, { recursive: true });
  return realpathSync(raw);
}

function jsonlFor(agentId: string, extra = ''): string {
  return [
    line({ type: 'user', timestamp: '2026-07-01T10:00:00.000Z', message: { role: 'user', content: [{ type: 'text', text: `task ${agentId}` }] } }),
    line({ type: 'assistant', timestamp: '2026-07-01T10:00:05.000Z', message: { model: 'claude-opus-4-8', usage: { output_tokens: 10 }, content: [{ type: 'text', text: `done ${agentId}` }] } }),
  ].join('\n') + extra;
}

/** Writes a live sub-agent transcript under <root>/<session>/subagents/. */
function writeLive(root: string, sessionId: string, agentId: string, agentType: string, jsonl: string): void {
  const subDir = join(root, sessionId, 'subagents');
  mkdirSync(subDir, { recursive: true });
  writeFileSync(join(subDir, `agent-${agentId}.jsonl`), jsonl);
  writeFileSync(join(subDir, `agent-${agentId}.meta.json`), JSON.stringify({ agentType, description: '' }));
}

/** Writes a gzipped archived run under <archiveRoot>/<agentType>/<session>/. */
function writeArchived(archiveRoot: string, agentType: string, sessionId: string, agentId: string, jsonl: string, opts: { meta?: boolean } = {}): void {
  const dir = join(archiveRoot, agentType, sessionId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `agent-${agentId}.jsonl.gz`), gzipSync(Buffer.from(jsonl, 'utf-8')));
  if (opts.meta !== false) {
    writeFileSync(join(dir, `agent-${agentId}.meta.json`), JSON.stringify({ agentType, description: '' }));
  }
}

describe('defaultArchiveRoot', () => {
  it('points at .claude/grimoire/sessions under the project', () => {
    expect(defaultArchiveRoot('/proj')).toBe(join('/proj', '.claude', 'grimoire', 'sessions'));
  });
});

describe('readTranscriptText', () => {
  let root: string;
  beforeEach(() => { root = tmpRoot('read'); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  it('reads plain text', () => {
    const p = join(root, 'a.jsonl');
    writeFileSync(p, 'hello');
    expect(readTranscriptText(p, false)).toBe('hello');
  });

  it('gunzips gzipped text', () => {
    const p = join(root, 'a.jsonl.gz');
    writeFileSync(p, gzipSync(Buffer.from('hello gz', 'utf-8')));
    expect(readTranscriptText(p, true)).toBe('hello gz');
  });

  it('returns null on a corrupt gzip without throwing', () => {
    const p = join(root, 'bad.jsonl.gz');
    writeFileSync(p, 'not actually gzip');
    expect(readTranscriptText(p, true)).toBeNull();
  });

  it('returns null on a missing file', () => {
    expect(readTranscriptText(join(root, 'missing'), false)).toBeNull();
  });
});

describe('listArchivedSubagentFiles', () => {
  let archiveRoot: string;
  beforeEach(() => { archiveRoot = tmpRoot('list'); });
  afterEach(() => { rmSync(archiveRoot, { recursive: true, force: true }); });

  it('walks <agentType>/<session> and flags gz + the agent-type hint', () => {
    writeArchived(archiveRoot, 'grimoire.typescript-coder', 'sess-1', 'ag1', jsonlFor('ag1'));
    const files = listArchivedSubagentFiles(archiveRoot);
    expect(files).toHaveLength(1);
    expect(files[0]).toMatchObject({ agentId: 'ag1', sessionId: 'sess-1', gz: true, agentTypeHint: 'grimoire.typescript-coder' });
  });

  it('returns empty for a missing archive root', () => {
    expect(listArchivedSubagentFiles(join(archiveRoot, 'nope'))).toEqual([]);
  });
});

describe('loadMergedInvocations', () => {
  let liveDir: string;
  let archiveDir: string;
  beforeEach(() => {
    liveDir = tmpRoot('live');
    archiveDir = tmpRoot('archive');
  });
  afterEach(() => {
    rmSync(liveDir, { recursive: true, force: true });
    rmSync(archiveDir, { recursive: true, force: true });
  });

  it('returns archived runs when the live dir is null (purged history)', () => {
    writeArchived(archiveDir, 'grimoire.rust-coder', 'sess-1', 'ag1', jsonlFor('ag1'));
    const invs = loadMergedInvocations(null, archiveDir);
    expect(invs).toHaveLength(1);
    expect(invs[0]!.agentType).toBe('grimoire.rust-coder');
    expect(invs[0]!.taskPrompt).toBe('task ag1');
  });

  it('returns live runs when the archive is null', () => {
    writeLive(liveDir, 'sess-1', 'ag1', 'grimoire.typescript-coder', jsonlFor('ag1'));
    const invs = loadMergedInvocations(liveDir, null);
    expect(invs).toHaveLength(1);
    expect(invs[0]!.agentType).toBe('grimoire.typescript-coder');
  });

  it('unions disjoint live and archived runs', () => {
    writeLive(liveDir, 'sess-1', 'live1', 'grimoire.typescript-coder', jsonlFor('live1'));
    writeArchived(archiveDir, 'grimoire.rust-coder', 'sess-2', 'arch1', jsonlFor('arch1'));
    const invs = loadMergedInvocations(liveDir, archiveDir);
    expect(invs.map((i) => i.agentId).sort()).toEqual(['arch1', 'live1']);
  });

  it('dedupes the same agentId, keeping the longer transcript (live still growing)', () => {
    // Archive was written mid-run (short); the live copy has since grown.
    writeArchived(archiveDir, 'grimoire.typescript-coder', 'sess-1', 'ag1', jsonlFor('ag1'));
    writeLive(liveDir, 'sess-1', 'ag1', 'grimoire.typescript-coder', jsonlFor('ag1', '\n' + line({ type: 'assistant', timestamp: '2026-07-01T10:00:09.000Z', message: { content: [{ type: 'text', text: 'extra final work' }] } })));
    const invs = loadMergedInvocations(liveDir, archiveDir);
    expect(invs).toHaveLength(1);
    expect(invs[0]!.finalText).toBe('extra final work');
  });

  it('keeps the archived copy when it is longer than the live (live purged to a stub)', () => {
    writeLive(liveDir, 'sess-1', 'ag1', 'grimoire.typescript-coder', jsonlFor('ag1'));
    writeArchived(archiveDir, 'grimoire.typescript-coder', 'sess-1', 'ag1', jsonlFor('ag1', '\n' + line({ type: 'assistant', timestamp: '2026-07-01T10:00:09.000Z', message: { content: [{ type: 'text', text: 'archived fuller final' }] } })));
    const invs = loadMergedInvocations(liveDir, archiveDir);
    expect(invs).toHaveLength(1);
    expect(invs[0]!.finalText).toBe('archived fuller final');
  });

  it('skips a corrupt gz without dropping the whole load', () => {
    writeLive(liveDir, 'sess-1', 'good', 'grimoire.typescript-coder', jsonlFor('good'));
    const dir = join(archiveDir, 'grimoire.rust-coder', 'sess-2');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'agent-bad.jsonl.gz'), 'corrupt not-gzip bytes');
    const invs = loadMergedInvocations(liveDir, archiveDir);
    expect(invs.map((i) => i.agentId)).toEqual(['good']);
  });

  it('falls back to the agent-type dir name when a run has no meta file', () => {
    writeArchived(archiveDir, 'grimoire.vue3-coder', 'sess-1', 'ag1', jsonlFor('ag1'), { meta: false });
    const invs = loadMergedInvocations(null, archiveDir);
    expect(invs[0]!.agentType).toBe('grimoire.vue3-coder');
  });

  it('returns empty when both sources are null', () => {
    expect(loadMergedInvocations(null, null)).toEqual([]);
  });
});

// =============================================================================
// Per-session analysis persistence (analysis.md + analysis.meta.json)
// =============================================================================

describe('sessionAnalysisPaths', () => {
  it('builds analysis.md / analysis.meta.json under <root>/<agentType>/<session>', () => {
    const p = sessionAnalysisPaths('/root', 'grimoire.rust-coder', 'sess-1');
    expect(p.dir).toBe(join('/root', 'grimoire.rust-coder', 'sess-1'));
    expect(p.mdPath).toBe(join(p.dir, 'analysis.md'));
    expect(p.metaPath).toBe(join(p.dir, 'analysis.meta.json'));
  });

  it('sanitizes hostile path segments so they cannot escape the root', () => {
    // Matches the router's sanitizeSegment: '/' → '-', and an all-dots segment
    // ('..') collapses to dashes; both stay a single literal dir name.
    const p = sessionAnalysisPaths('/root', '../evil', '..');
    expect(p.dir).toBe(join('/root', '..-evil', '--'));
  });
});

describe('writeSessionAnalysis / readSessionAnalysis', () => {
  let archiveRoot: string;
  beforeEach(() => { archiveRoot = tmpRoot('analysis'); });
  afterEach(() => { rmSync(archiveRoot, { recursive: true, force: true }); });

  it('round-trips the review markdown and its metadata', () => {
    const generatedAt = writeSessionAnalysis(archiveRoot, 'grimoire.rust-coder', 'sess-1', {
      result: '## Review\nlooks good',
      model: 'haiku',
      costUsd: 0.0123,
      durationMs: 4200,
      runsAnalyzed: 1,
      agentId: 'ag1',
    });
    expect(generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    const back = readSessionAnalysis(archiveRoot, 'grimoire.rust-coder', 'sess-1');
    expect(back).not.toBeNull();
    expect(back!.result).toBe('## Review\nlooks good');
    expect(back!.model).toBe('haiku');
    expect(back!.costUsd).toBeCloseTo(0.0123);
    expect(back!.durationMs).toBe(4200);
    expect(back!.runsAnalyzed).toBe(1);
    expect(back!.generatedAt).toBe(generatedAt);
  });

  it('overwrites in place so only one analysis.md ever exists', () => {
    writeSessionAnalysis(archiveRoot, 'grimoire.rust-coder', 'sess-1', { result: 'first' });
    writeSessionAnalysis(archiveRoot, 'grimoire.rust-coder', 'sess-1', { result: 'second' });
    const { mdPath } = sessionAnalysisPaths(archiveRoot, 'grimoire.rust-coder', 'sess-1');
    expect(readFileSync(mdPath, 'utf-8')).toBe('second');
    expect(readSessionAnalysis(archiveRoot, 'grimoire.rust-coder', 'sess-1')!.result).toBe('second');
  });

  it('creates the session dir when it does not exist yet (live-only session)', () => {
    const { dir } = sessionAnalysisPaths(archiveRoot, 'grimoire.vue3-coder', 'sess-x');
    expect(existsSync(dir)).toBe(false);
    writeSessionAnalysis(archiveRoot, 'grimoire.vue3-coder', 'sess-x', { result: 'hi' });
    expect(existsSync(dir)).toBe(true);
  });

  it('returns null when no analysis has been written', () => {
    expect(readSessionAnalysis(archiveRoot, 'grimoire.rust-coder', 'nope')).toBeNull();
  });

  it('still returns the markdown when the meta sidecar is missing', () => {
    const { dir, mdPath } = sessionAnalysisPaths(archiveRoot, 'grimoire.rust-coder', 'sess-2');
    mkdirSync(dir, { recursive: true });
    writeFileSync(mdPath, 'just markdown');
    const back = readSessionAnalysis(archiveRoot, 'grimoire.rust-coder', 'sess-2');
    expect(back!.result).toBe('just markdown');
    expect(back!.model).toBeUndefined();
  });
});

describe('findSessionRef', () => {
  let liveDir: string;
  let archiveDir: string;
  beforeEach(() => { liveDir = tmpRoot('ref-live'); archiveDir = tmpRoot('ref-arch'); });
  afterEach(() => {
    rmSync(liveDir, { recursive: true, force: true });
    rmSync(archiveDir, { recursive: true, force: true });
  });

  it('resolves an archived agentId to its {agentType, sessionId}', () => {
    writeArchived(archiveDir, 'grimoire.rust-coder', 'sess-1', 'ag1', jsonlFor('ag1'));
    expect(findSessionRef(null, archiveDir, 'ag1')).toEqual({ agentType: 'grimoire.rust-coder', sessionId: 'sess-1' });
  });

  it('resolves a live agentId via its meta file', () => {
    writeLive(liveDir, 'sess-2', 'ag2', 'grimoire.typescript-coder', jsonlFor('ag2'));
    expect(findSessionRef(liveDir, null, 'ag2')).toEqual({ agentType: 'grimoire.typescript-coder', sessionId: 'sess-2' });
  });

  it('falls back to the agent-type dir name when an archived run has no meta', () => {
    writeArchived(archiveDir, 'grimoire.vue3-coder', 'sess-3', 'ag3', jsonlFor('ag3'), { meta: false });
    expect(findSessionRef(null, archiveDir, 'ag3')).toEqual({ agentType: 'grimoire.vue3-coder', sessionId: 'sess-3' });
  });

  it('returns null for an unknown agentId', () => {
    expect(findSessionRef(liveDir, archiveDir, 'ghost')).toBeNull();
  });
});
