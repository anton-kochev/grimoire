import { describe, it, expect } from 'vitest';
import { buildPreToolUseOutput } from '../src/tool-output.js';

describe('buildPreToolUseOutput', () => {
  it('should build output with correct structure', () => {
    const output = buildPreToolUseOutput('some context');

    expect(output.hookSpecificOutput).toBeDefined();
    expect(output.hookSpecificOutput.hookEventName).toBe('PreToolUse');
    expect(output.hookSpecificOutput.additionalContext).toBe('some context');
    expect(output.hookSpecificOutput.permissionDecision).toBe('allow');
  });

  it('should always set permissionDecision to allow', () => {
    const output = buildPreToolUseOutput('');

    expect(output.hookSpecificOutput.permissionDecision).toBe('allow');
  });

  it('should preserve multiline context', () => {
    const context = 'Line 1\nLine 2\nLine 3';
    const output = buildPreToolUseOutput(context);

    expect(output.hookSpecificOutput.additionalContext).toBe(context);
  });

  it('should handle empty context', () => {
    const output = buildPreToolUseOutput('');

    expect(output.hookSpecificOutput.additionalContext).toBe('');
  });

  it('should set hookEventName to PreToolUse', () => {
    const output = buildPreToolUseOutput('ctx');

    expect(output.hookSpecificOutput.hookEventName).toBe('PreToolUse');
  });
});
