import { describe, it, expect } from 'vitest';
import { parseInvocation, type InvocationProfile } from '../src/transcripts.js';
import { aggregate, analyze, parseGrantedTools, enforceContextFromLog } from '../src/insights-analysis.js';
import { buildEvidencePrompt } from '../src/agent-analysis.js';

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
// aggregate / analyze
// =============================================================================

function mkInv(over: Partial<InvocationProfile>): InvocationProfile {
  return {
    agentId: 'a', agentType: 'X', description: '', sessionId: 's', model: 'claude-opus-4-8',
    toolCounts: {}, toolSequence: [], toolCalls: 0, turns: 0,
    tokens: { output: 0, input: 0, cacheRead: 0, cacheCreation: 0, total: 0 },
    firstTs: null, lastTs: null, spanMs: 0, toolErrors: 0, filesTouched: [], maxFileEdits: 0,
    toolEvents: [], reasoningSnippets: [],
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
    // 9 invocations but capped at 6, most recent first
    expect(prompt).toContain('Observed runs (the 6 most recent of 9 recorded)');
  });
});
