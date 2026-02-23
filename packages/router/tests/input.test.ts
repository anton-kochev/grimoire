import { describe, it, expect } from 'vitest';
import { parseHookInput, parseStdinInput } from '../src/input.js';

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
