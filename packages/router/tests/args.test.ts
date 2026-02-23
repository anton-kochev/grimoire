import { describe, it, expect } from 'vitest';
import { parseArgs } from '../src/args.js';

describe('parseArgs', () => {
  it('should return empty object for no arguments', () => {
    expect(parseArgs([])).toEqual({});
  });

  it('should return empty object for unrelated arguments', () => {
    expect(parseArgs(['node', 'script.js', '--other', 'value'])).toEqual({});
  });

  it('should parse --agent=<name> format', () => {
    const result = parseArgs(['node', 'script.js', '--agent=csharp-coder']);
    expect(result.agent).toBe('csharp-coder');
  });

  it('should parse --agent <name> format', () => {
    const result = parseArgs(['node', 'script.js', '--agent', 'dotnet-architect']);
    expect(result.agent).toBe('dotnet-architect');
  });

  it('should handle agent name with hyphens', () => {
    const result = parseArgs(['--agent=my-custom-agent-name']);
    expect(result.agent).toBe('my-custom-agent-name');
  });

  it('should ignore empty --agent= value', () => {
    const result = parseArgs(['--agent=']);
    expect(result.agent).toBeUndefined();
  });

  it('should prefer later --agent flag', () => {
    const result = parseArgs([
      '--agent=first',
      '--agent=second',
    ]);
    expect(result.agent).toBe('second');
  });

  it('should handle mixed format (last occurrence wins)', () => {
    // Space-separated format is processed after equals format
    const result = parseArgs([
      '--agent=equals-value',
      '--agent', 'space-value',
    ]);
    expect(result.agent).toBe('space-value');
  });

  it('should not use flag-like value for --agent <value>', () => {
    const result = parseArgs(['--agent', '--other-flag']);
    expect(result.agent).toBeUndefined();
  });

  it('should handle typical process.argv format', () => {
    const result = parseArgs([
      '/usr/local/bin/node',
      '/path/to/script.js',
      '--agent=csharp-coder',
    ]);
    expect(result.agent).toBe('csharp-coder');
  });

  it('should parse --enforce flag', () => {
    // Arrange + Act
    const result = parseArgs(['node', 'script.js', '--enforce']);

    // Assert
    expect(result.enforce).toBe(true);
  });

  it('should parse --subagent-start flag', () => {
    // Arrange + Act
    const result = parseArgs(['node', 'script.js', '--subagent-start']);

    // Assert
    expect(result.subagentStart).toBe(true);
  });

  it('should parse --subagent-stop flag', () => {
    // Arrange + Act
    const result = parseArgs(['node', 'script.js', '--subagent-stop']);

    // Assert
    expect(result.subagentStop).toBe(true);
  });

  it('should leave enforce flags undefined when not provided', () => {
    // Arrange + Act
    const result = parseArgs(['node', 'script.js']);

    // Assert
    expect(result.enforce).toBeUndefined();
    expect(result.subagentStart).toBeUndefined();
    expect(result.subagentStop).toBeUndefined();
  });
});
