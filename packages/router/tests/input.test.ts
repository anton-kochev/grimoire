import { describe, it, expect } from 'vitest';
import { buildSubagentInput, parseHookInput, parseStdinInput } from '../src/input.js';

describe('parseHookInput', () => {
  it('should parse valid JSON input', () => {
    const json = JSON.stringify({
      prompt: 'Process the invoice',
      session_id: '123-456',
      timestamp: '2026-01-30T14:00:00.000Z',
    });

    const input = parseHookInput(json);

    expect(input.prompt).toBe('Process the invoice');
    expect(input.session_id).toBe('123-456');
    expect(input.timestamp).toBe('2026-01-30T14:00:00.000Z');
  });

  it('should throw for empty input', () => {
    expect(() => parseHookInput('')).toThrow(/empty/i);
  });

  it('should throw for whitespace-only input', () => {
    expect(() => parseHookInput('   \n\t  ')).toThrow(/empty/i);
  });

  it('should throw for invalid JSON', () => {
    expect(() => parseHookInput('{ not valid json')).toThrow(/parse|JSON/i);
  });

  it('should throw for missing prompt field', () => {
    const json = JSON.stringify({
      session_id: '123',
      timestamp: '2026-01-30T14:00:00.000Z',
    });

    expect(() => parseHookInput(json)).toThrow(/prompt/i);
  });

  it('should throw for non-string prompt', () => {
    const json = JSON.stringify({
      prompt: 123,
      session_id: '123',
      timestamp: '2026-01-30T14:00:00.000Z',
    });

    expect(() => parseHookInput(json)).toThrow(/prompt.*string/i);
  });

  it('should handle missing session_id gracefully', () => {
    const json = JSON.stringify({
      prompt: 'test',
      timestamp: '2026-01-30T14:00:00.000Z',
    });

    const input = parseHookInput(json);
    expect(input.session_id).toBe('unknown');
  });

  it('should handle missing timestamp gracefully', () => {
    const json = JSON.stringify({
      prompt: 'test',
      session_id: '123',
    });

    const input = parseHookInput(json);
    expect(input.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe('parseStdinInput', () => {
  it('should return prompt kind for UserPromptSubmit input', () => {
    const json = JSON.stringify({
      prompt: 'hello world',
      session_id: 'sess-1',
      timestamp: '2026-01-30T14:00:00.000Z',
    });

    const result = parseStdinInput(json);

    expect(result.kind).toBe('prompt');
    if (result.kind === 'prompt') {
      expect(result.input.prompt).toBe('hello world');
    }
  });

  it('should return tooluse kind for PreToolUse input', () => {
    const json = JSON.stringify({
      tool_name: 'Edit',
      tool_input: { file_path: '/src/main.ts' },
      session_id: 'sess-1',
    });

    const result = parseStdinInput(json);

    expect(result.kind).toBe('tooluse');
    if (result.kind === 'tooluse') {
      expect(result.input.tool_name).toBe('Edit');
    }
  });

  it('should throw for empty input', () => {
    expect(() => parseStdinInput('')).toThrow(/empty/i);
  });

  it('should throw for invalid JSON', () => {
    expect(() => parseStdinInput('bad json')).toThrow(/parse|JSON/i);
  });

  it('should dispatch Write tool to tooluse', () => {
    const json = JSON.stringify({
      tool_name: 'Write',
      tool_input: { file_path: '/new.ts', content: 'x' },
    });

    const result = parseStdinInput(json);
    expect(result.kind).toBe('tooluse');
  });
});

describe('buildSubagentInput', () => {
  it('should map all subagent fields from the stdin payload', () => {
    const input = buildSubagentInput({
      session_id: 'sess-1',
      agent_id: 'a1',
      agent_type: 'grimoire.typescript-coder',
      stop_reason: 'success',
      transcript_path: '/home/u/.claude/projects/-p/sess-1.jsonl',
      agent_transcript_path: '/home/u/.claude/projects/-p/sess-1/subagents/agent-a1.jsonl',
      cwd: '/p',
    });

    expect(input).toEqual({
      session_id: 'sess-1',
      agent_id: 'a1',
      agent_type: 'grimoire.typescript-coder',
      stop_reason: 'success',
      transcript_path: '/home/u/.claude/projects/-p/sess-1.jsonl',
      agent_transcript_path: '/home/u/.claude/projects/-p/sess-1/subagents/agent-a1.jsonl',
      cwd: '/p',
    });
  });

  it('should omit absent or non-string optional fields and default session_id', () => {
    const input = buildSubagentInput({ agent_id: 42, transcript_path: null });

    expect(input).toEqual({ session_id: 'unknown' });
  });
});
