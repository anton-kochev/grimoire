import { describe, it, expect } from 'vitest';
import {
  isPreToolUseInput,
  parsePreToolUseInput,
  extractToolSignals,
} from '../src/tool-input.js';

describe('isPreToolUseInput', () => {
  it('should return true when tool_name is a string', () => {
    expect(isPreToolUseInput({ tool_name: 'Edit' })).toBe(true);
  });

  it('should return false when tool_name is missing', () => {
    expect(isPreToolUseInput({ prompt: 'hello' })).toBe(false);
  });

  it('should return false when tool_name is not a string', () => {
    expect(isPreToolUseInput({ tool_name: 123 })).toBe(false);
  });

  it('should return false for null', () => {
    expect(isPreToolUseInput(null)).toBe(false);
  });

  it('should return false for non-object', () => {
    expect(isPreToolUseInput('string')).toBe(false);
  });
});

describe('parsePreToolUseInput', () => {
  it('should parse valid Edit input', () => {
    const json = JSON.stringify({
      session_id: 'sess-1',
      tool_name: 'Edit',
      tool_use_id: 'tu-1',
      tool_input: { file_path: '/src/main.ts', old_string: 'a', new_string: 'b' },
    });

    const result = parsePreToolUseInput(json);

    expect(result.tool_name).toBe('Edit');
    expect(result.session_id).toBe('sess-1');
    expect(result.tool_use_id).toBe('tu-1');
    expect(result.hook_event_name).toBe('PreToolUse');
    expect(result.tool_input).toEqual({
      file_path: '/src/main.ts',
      old_string: 'a',
      new_string: 'b',
    });
  });

  it('should parse valid Write input', () => {
    const json = JSON.stringify({
      session_id: 'sess-2',
      tool_name: 'Write',
      tool_use_id: 'tu-2',
      tool_input: { file_path: '/src/new.ts', content: 'hello' },
    });

    const result = parsePreToolUseInput(json);

    expect(result.tool_name).toBe('Write');
  });

  it('should throw for unsupported tool_name', () => {
    const json = JSON.stringify({
      tool_name: 'Bash',
      tool_input: {},
    });

    expect(() => parsePreToolUseInput(json)).toThrow(/unsupported tool/i);
  });

  it('should throw for empty input', () => {
    expect(() => parsePreToolUseInput('')).toThrow(/empty/i);
  });

  it('should throw for invalid JSON', () => {
    expect(() => parsePreToolUseInput('not json')).toThrow(/parse|JSON/i);
  });

  it('should throw when tool_name is missing', () => {
    const json = JSON.stringify({ tool_input: {} });

    expect(() => parsePreToolUseInput(json)).toThrow(/tool_name/i);
  });

  it('should default session_id to unknown', () => {
    const json = JSON.stringify({
      tool_name: 'Edit',
      tool_input: { file_path: '/a.ts' },
    });

    const result = parsePreToolUseInput(json);
    expect(result.session_id).toBe('unknown');
  });

  it('should default tool_use_id to empty string', () => {
    const json = JSON.stringify({
      tool_name: 'Write',
      tool_input: { file_path: '/a.ts' },
    });

    const result = parsePreToolUseInput(json);
    expect(result.tool_use_id).toBe('');
  });

  it('should default tool_input to empty object when missing', () => {
    const json = JSON.stringify({
      tool_name: 'Edit',
    });

    const result = parsePreToolUseInput(json);
    expect(result.tool_input).toEqual({});
  });
});

describe('extractToolSignals', () => {
  it('should extract extension from file_path', () => {
    const signals = extractToolSignals(
      { file_path: '/project/src/main.ts' },
      '/project'
    );

    expect(signals.extensions.has('.ts')).toBe(true);
  });

  it('should extract relative path', () => {
    const signals = extractToolSignals(
      { file_path: '/project/src/services/UserService.cs' },
      '/project'
    );

    expect(signals.paths).toContain('src/services/userservice.cs');
  });

  it('should extract words from path segments', () => {
    const signals = extractToolSignals(
      { file_path: '/project/src/services/UserService.cs' },
      '/project'
    );

    expect(signals.words.has('src')).toBe(true);
    expect(signals.words.has('services')).toBe(true);
    expect(signals.words.has('userservice')).toBe(true);
  });

  it('should handle file_path without projectDir prefix', () => {
    const signals = extractToolSignals(
      { file_path: '/other/path/file.ts' },
      '/project'
    );

    expect(signals.extensions.has('.ts')).toBe(true);
    expect(signals.paths).toContain('/other/path/file.ts');
  });

  it('should handle missing file_path', () => {
    const signals = extractToolSignals({ content: 'hello' }, '/project');

    expect(signals.words.size).toBe(0);
    expect(signals.extensions.size).toBe(0);
    expect(signals.paths).toHaveLength(0);
  });

  it('should handle non-string file_path', () => {
    const signals = extractToolSignals({ file_path: 123 }, '/project');

    expect(signals.words.size).toBe(0);
    expect(signals.extensions.size).toBe(0);
    expect(signals.paths).toHaveLength(0);
  });

  it('should strip trailing slash from projectDir', () => {
    const signals = extractToolSignals(
      { file_path: '/project/src/main.ts' },
      '/project/'
    );

    expect(signals.paths).toContain('src/main.ts');
  });

  it('should handle file with no extension', () => {
    const signals = extractToolSignals(
      { file_path: '/project/Makefile' },
      '/project'
    );

    expect(signals.extensions.size).toBe(0);
    expect(signals.words.has('makefile')).toBe(true);
  });
});
