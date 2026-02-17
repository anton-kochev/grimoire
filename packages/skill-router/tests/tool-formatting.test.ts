import { describe, it, expect } from 'vitest';
import { formatToolUseContext } from '../src/tool-formatting.js';
import type { SkillScoreResult } from '../src/types.js';

describe('formatToolUseContext', () => {
  const makeResult = (
    name: string,
    path: string,
    score: number,
    signals: SkillScoreResult['matchedSignals'] = []
  ): SkillScoreResult => ({
    skill: { name, path },
    score,
    matchedSignals: signals,
  });

  it('should format single skill for Edit', () => {
    const skills = [
      makeResult('Modern TypeScript', '.claude/skills/modern-typescript', 1.5, [
        { type: 'extension', value: '.ts' },
      ]),
    ];

    const output = formatToolUseContext(skills, 'Edit');

    expect(output).toContain('[Skill Router]');
    expect(output).toContain('Edit');
    expect(output).toContain('Modern TypeScript');
    expect(output).toContain('SKILL.md');
    expect(output).toContain('1.5');
    expect(output).toContain('extensions[.ts]');
  });

  it('should format single skill for Write', () => {
    const skills = [
      makeResult('DotNet Unit Testing', '.claude/skills/dotnet', 2.0, [
        { type: 'extension', value: '.cs' },
      ]),
    ];

    const output = formatToolUseContext(skills, 'Write');

    expect(output).toContain('Write');
    expect(output).toContain('DotNet Unit Testing');
  });

  it('should format multiple skills sorted by score', () => {
    const skills = [
      makeResult('Skill A', '/a', 3.0, [
        { type: 'keyword', value: 'test' },
      ]),
      makeResult('Skill B', '/b', 1.5, [
        { type: 'extension', value: '.ts' },
      ]),
    ];

    const output = formatToolUseContext(skills, 'Edit');

    const indexA = output.indexOf('Skill A');
    const indexB = output.indexOf('Skill B');
    expect(indexA).toBeLessThan(indexB);
  });

  it('should show read instruction when no content provided', () => {
    const skills = [makeResult('Test', '/test', 1.5)];
    const output = formatToolUseContext(skills, 'Edit');

    expect(output).toContain(
      'Please read the SKILL.md file(s) listed above using the Read tool before continuing with this Edit operation.'
    );
    expect(output).not.toContain('Make sure to activate');
  });

  it('should show read instruction when content map is empty', () => {
    const skills = [makeResult('Test', '/test', 1.5)];
    const output = formatToolUseContext(skills, 'Edit', new Map());

    expect(output).toContain(
      'Please read the SKILL.md file(s) listed above using the Read tool before continuing with this Edit operation.'
    );
  });

  it('should inject skill content when provided', () => {
    const skills = [
      makeResult('Modern TypeScript', '.claude/skills/modern-typescript', 1.5, [
        { type: 'extension', value: '.ts' },
      ]),
    ];
    const contents = new Map([
      ['.claude/skills/modern-typescript', '# Modern TypeScript\n\nUse strict mode always.'],
    ]);

    const output = formatToolUseContext(skills, 'Edit', contents);

    expect(output).toContain('# Modern TypeScript');
    expect(output).toContain('Use strict mode always.');
    expect(output).toContain(
      'Follow the skill instructions above for this Edit operation.'
    );
    expect(output).not.toContain('Please read the SKILL.md');
  });

  it('should handle skill with no matched signals', () => {
    const skills = [makeResult('Test', '/test', 1.5, [])];
    const output = formatToolUseContext(skills, 'Edit');

    expect(output).toContain('Test');
    expect(output).toContain('1.5');
  });

  it('should show path signals', () => {
    const skills = [
      makeResult('Test', '/test', 2.5, [
        { type: 'path', value: 'tests/' },
      ]),
    ];
    const output = formatToolUseContext(skills, 'Write');

    expect(output).toContain('paths[tests/]');
  });

  it('should show keyword signals', () => {
    const skills = [
      makeResult('Test', '/test', 1.0, [
        { type: 'keyword', value: 'typescript' },
      ]),
    ];
    const output = formatToolUseContext(skills, 'Edit');

    expect(output).toContain('keywords[typescript]');
  });

  it('should include score with one decimal place', () => {
    const skills = [makeResult('Test', '/test', 2.0)];
    const output = formatToolUseContext(skills, 'Edit');

    expect(output).toContain('score: 2.0');
  });
});
