import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { printSummary } from '../src/summary.js';
import type { InstallSummary } from '../src/types.js';

describe('printSummary', () => {
  let logs: string[];
  const originalLog = console.log;

  beforeEach(() => {
    logs = [];
    console.log = (...args: unknown[]) => {
      logs.push(args.map(String).join(' '));
    };
  });

  afterEach(() => {
    console.log = originalLog;
  });

  it('should format agents and skills with destination paths', () => {
    const summary: InstallSummary = {
      packs: [{ name: 'test-pack', version: '1.0.0' }],
      results: [
        {
          item: { type: 'agent', name: 'my-agent', sourcePath: 'agents/my-agent.md', description: 'Agent' },
          destinationPath: '.claude/agents/my-agent.md',
          overwritten: false,
        },
        {
          item: { type: 'skill', name: 'my-skill', sourcePath: 'skills/my-skill', description: 'Skill' },
          destinationPath: '.claude/skills/my-skill',
          overwritten: false,
        },
      ],
    };

    printSummary(summary);

    const output = logs.join('\n');
    expect(output).toContain('test-pack');
    expect(output).toContain('my-agent');
    expect(output).toContain('my-skill');
    expect(output).toContain('.claude/agents/my-agent.md');
    expect(output).toContain('.claude/skills/my-skill');
  });

  it('should show (overwritten) tag for overwritten items', () => {
    const summary: InstallSummary = {
      packs: [{ name: 'test-pack', version: '1.0.0' }],
      results: [
        {
          item: { type: 'agent', name: 'my-agent', sourcePath: 'agents/my-agent.md', description: 'Agent' },
          destinationPath: '.claude/agents/my-agent.md',
          overwritten: true,
        },
      ],
    };

    printSummary(summary);

    const output = logs.join('\n');
    expect(output).toContain('overwritten');
  });

  it('should handle empty results gracefully', () => {
    const summary: InstallSummary = {
      packs: [{ name: 'test-pack', version: '1.0.0' }],
      results: [],
    };

    printSummary(summary);

    const output = logs.join('\n');
    expect(output).toContain('test-pack');
    expect(output).toContain('nothing');
  });

  it('should show multiple pack names', () => {
    const summary: InstallSummary = {
      packs: [
        { name: 'dotnet-pack', version: '1.0.0' },
        { name: 'ts-pack', version: '2.0.0' },
      ],
      results: [
        {
          item: { type: 'agent', name: 'my-agent', sourcePath: 'agents/my-agent.md', description: 'Agent' },
          destinationPath: '.claude/agents/my-agent.md',
          overwritten: false,
        },
      ],
    };

    printSummary(summary);

    const output = logs.join('\n');
    expect(output).toContain('dotnet-pack@1.0.0');
    expect(output).toContain('ts-pack@2.0.0');
  });
});
