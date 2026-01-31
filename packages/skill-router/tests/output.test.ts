import { describe, it, expect } from 'vitest';
import { buildHookOutput } from '../src/output.js';

describe('buildHookOutput', () => {
  it('should build output with correct structure', () => {
    const context = '[Skill Router] Test context message';
    const output = buildHookOutput(context);

    expect(output.hookSpecificOutput).toBeDefined();
    expect(output.hookSpecificOutput.hookEventName).toBe('UserPromptSubmit');
    expect(output.hookSpecificOutput.additionalContext).toBe(context);
  });

  it('should preserve multiline context', () => {
    const context = 'Line 1\nLine 2\nLine 3';
    const output = buildHookOutput(context);

    expect(output.hookSpecificOutput.additionalContext).toBe(context);
  });

  it('should handle empty context', () => {
    const output = buildHookOutput('');

    expect(output.hookSpecificOutput.additionalContext).toBe('');
  });
});
