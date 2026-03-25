import { describe, it, expect } from 'vitest';
import { parseAgentSkills, updateAgentSkills } from '../src/frontmatter.js';

// =============================================================================
// parseAgentSkills
// =============================================================================

describe('parseAgentSkills', () => {
  it('should return empty array when no skills key', () => {
    const content = '---\nname: test-agent\ndescription: "A test agent"\n---\n\nBody content.';
    expect(parseAgentSkills(content)).toEqual([]);
  });

  it('should return empty array for empty skills list', () => {
    const content = '---\nname: test-agent\nskills:\n---\n\nBody.';
    expect(parseAgentSkills(content)).toEqual([]);
  });

  it('should return skill names from skills array', () => {
    const content = [
      '---',
      'name: test-agent',
      'skills:',
      '  - skill-a',
      '  - skill-b',
      '---',
      '',
      'Body content.',
    ].join('\n');
    expect(parseAgentSkills(content)).toEqual(['skill-a', 'skill-b']);
  });

  it('should return empty array when no frontmatter at all', () => {
    const content = '# Just a markdown file\n\nNo frontmatter here.';
    expect(parseAgentSkills(content)).toEqual([]);
  });

  it('should return empty array for empty string input', () => {
    expect(parseAgentSkills('')).toEqual([]);
  });

  it('should not confuse --- horizontal rule in body with frontmatter', () => {
    const content = [
      '---',
      'name: test-agent',
      'skills:',
      '  - skill-a',
      '---',
      '',
      'Body content.',
      '',
      '---',
      '',
      'More body after horizontal rule.',
    ].join('\n');
    expect(parseAgentSkills(content)).toEqual(['skill-a']);
  });

  it('should trim whitespace from skill names', () => {
    const content = [
      '---',
      'name: test-agent',
      'skills:',
      '  -   skill-a  ',
      '  - skill-b ',
      '---',
    ].join('\n');
    expect(parseAgentSkills(content)).toEqual(['skill-a', 'skill-b']);
  });

  it('should parse skills correctly with complex YAML description', () => {
    const content = [
      '---',
      'name: grimoire.csharp-coder',
      'description: "Use this agent: it handles C#, TypeScript, and more. Keys: \\"value\\""',
      'tools: Read, Edit, Write',
      'skills:',
      '  - grimoire.unit-testing-dotnet',
      '  - grimoire.modern-csharp',
      'model: inherit',
      '---',
      '',
      'Body content here.',
    ].join('\n');
    expect(parseAgentSkills(content)).toEqual([
      'grimoire.unit-testing-dotnet',
      'grimoire.modern-csharp',
    ]);
  });
});

// =============================================================================
// updateAgentSkills
// =============================================================================

describe('updateAgentSkills', () => {
  it('should insert skills block before closing --- when no skills key exists', () => {
    const content = '---\nname: test-agent\ntools: Read, Edit\n---\n\nBody.';
    const result = updateAgentSkills(content, ['skill-a', 'skill-b']);
    expect(result).toContain('skills:\n  - skill-a\n  - skill-b\n---');
    expect(result).toContain('name: test-agent');
    expect(result).toContain('tools: Read, Edit');
    expect(result).toContain('Body.');
  });

  it('should replace existing skills items', () => {
    const content = [
      '---',
      'name: test-agent',
      'skills:',
      '  - old-skill-a',
      '  - old-skill-b',
      '---',
      '',
      'Body.',
    ].join('\n');
    const result = updateAgentSkills(content, ['new-skill-x']);
    expect(result).toContain('skills:\n  - new-skill-x\n---');
    expect(result).not.toContain('old-skill-a');
    expect(result).not.toContain('old-skill-b');
  });

  it('should remove entire skills block when given empty array', () => {
    const content = [
      '---',
      'name: test-agent',
      'skills:',
      '  - skill-a',
      '---',
      '',
      'Body.',
    ].join('\n');
    const result = updateAgentSkills(content, []);
    expect(result).not.toContain('skills:');
    expect(result).not.toContain('skill-a');
    expect(result).toContain('name: test-agent');
    expect(result).toContain('Body.');
  });

  it('should preserve field ordering when skills is in the middle', () => {
    const content = [
      '---',
      'name: test-agent',
      'skills:',
      '  - old-skill',
      'model: inherit',
      '---',
      '',
      'Body.',
    ].join('\n');
    const result = updateAgentSkills(content, ['new-skill']);
    const lines = result.split('\n');
    const nameIdx = lines.findIndex((l) => l.startsWith('name:'));
    const skillsIdx = lines.findIndex((l) => l.startsWith('skills:'));
    const modelIdx = lines.findIndex((l) => l.startsWith('model:'));
    expect(nameIdx).toBeLessThan(skillsIdx);
    expect(skillsIdx).toBeLessThan(modelIdx);
  });

  it('should preserve long description and body content', () => {
    const longDesc = 'description: "This is a very long description with special chars: colons, \\"quotes\\", and more"';
    const body = '## How You Work\n\n1. **Read the task**\n2. **Implement**\n3. **Verify**';
    const content = `---\nname: test-agent\n${longDesc}\n---\n\n${body}`;
    const result = updateAgentSkills(content, ['skill-a']);
    expect(result).toContain(longDesc);
    expect(result).toContain(body);
  });

  it('should preserve trailing newline', () => {
    const content = '---\nname: test-agent\n---\n\nBody.\n';
    const result = updateAgentSkills(content, ['skill-a']);
    expect(result.endsWith('\n')).toBe(true);
  });
});

// =============================================================================
// round-trip
// =============================================================================

describe('round-trip', () => {
  it('should parse back the same skills after update', () => {
    const original = '---\nname: test-agent\ntools: Read, Edit\nmodel: inherit\n---\n\nBody content.\n';
    const skills = ['grimoire.unit-testing-dotnet', 'grimoire.modern-csharp'];
    const updated = updateAgentSkills(original, skills);
    expect(parseAgentSkills(updated)).toEqual(skills);
  });

  it('should round-trip with existing skills replaced', () => {
    const content = [
      '---',
      'name: test-agent',
      'skills:',
      '  - old-a',
      '  - old-b',
      'model: inherit',
      '---',
      '',
      'Body.',
    ].join('\n');
    const newSkills = ['new-x', 'new-y', 'new-z'];
    const updated = updateAgentSkills(content, newSkills);
    expect(parseAgentSkills(updated)).toEqual(newSkills);
  });
});
