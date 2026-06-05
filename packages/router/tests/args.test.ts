import { describe, it, expect } from 'vitest';
import { parseArgs } from '../src/args.js';

describe('parseArgs', () => {
  it('should return empty object for no arguments', () => {
    expect(parseArgs([])).toEqual({});
  });

  it('should return empty object for unrelated arguments', () => {
    expect(parseArgs(['node', 'script.js', '--other', 'value'])).toEqual({});
  });

  it('should ignore legacy --agent flag (skill injection is native via skills frontmatter)', () => {
    expect(parseArgs(['node', 'script.js', '--agent=csharp-coder'])).toEqual({});
    expect(parseArgs(['node', 'script.js', '--agent', 'dotnet-architect'])).toEqual({});
  });

  it('should still parse known flags when legacy --agent is present', () => {
    const result = parseArgs(['node', 'script.js', '--subagent-start', '--agent=csharp-coder']);
    expect(result).toEqual({ subagentStart: true });
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
