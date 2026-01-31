import { describe, it, expect } from 'vitest';
import { parseHookInput } from '../src/input.js';

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
