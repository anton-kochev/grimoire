import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

vi.mock('@clack/prompts', () => ({
  intro: vi.fn(),
  outro: vi.fn(),
  cancel: vi.fn(),
  log: { warn: vi.fn(), error: vi.fn(), message: vi.fn(), info: vi.fn(), success: vi.fn() },
  select: vi.fn(),
  multiselect: vi.fn(),
  confirm: vi.fn(),
  isCancel: vi.fn((v: unknown) => v === Symbol.for('clack.cancel')),
}));

import * as clack from '@clack/prompts';
import { runAgentApproaches, runAgentApproachesFor } from '../src/commands/agent-approaches.js';
import { findApproach } from '../src/approaches-catalog.js';

const CANCEL = Symbol.for('clack.cancel');
const mockSelect = vi.mocked(clack.select);
const mockMultiselect = vi.mocked(clack.multiselect);
const mockConfirm = vi.mocked(clack.confirm);

const TDD_DIRECTIVE = findApproach('tdd')!.directive;

function makeTmpDir(): string {
  const raw = join(tmpdir(), `grimoire-agent-approaches-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(raw, { recursive: true });
  return realpathSync(raw);
}

function writeAgent(
  projectDir: string,
  name: string,
  opts: { skills?: string[]; tools?: string } = {},
): void {
  const agentsDir = join(projectDir, '.claude', 'agents');
  mkdirSync(agentsDir, { recursive: true });
  const toolsLine = opts.tools ? `tools: ${opts.tools}\n` : '';
  const skillsBlock = opts.skills?.length
    ? `skills:\n${opts.skills.map((s) => `  - ${s}`).join('\n')}\n`
    : '';
  writeFileSync(
    join(agentsDir, `${name}.md`),
    `---\nname: ${name}\ndescription: Test agent\n${toolsLine}${skillsBlock}---\n\n# Body`,
  );
}

function writeSkill(projectDir: string, name: string): void {
  const skillDir = join(projectDir, '.claude', 'skills', name);
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(join(skillDir, 'SKILL.md'), `---\nname: ${name}\ndescription: A skill\n---\n\n# Body`);
}

function makeManifest(
  projectDir: string,
  agents: Record<string, unknown> = {},
  extra: Record<string, unknown> = {},
): void {
  const claudeDir = join(projectDir, '.claude');
  mkdirSync(claudeDir, { recursive: true });
  writeFileSync(
    join(claudeDir, 'grimoire.json'),
    JSON.stringify({ ...extra, router: { version: '2.0.0', config: {}, skills: [], agents } }),
  );
}

function readAgents(projectDir: string): Record<string, { approaches?: Array<Record<string, unknown>> }> {
  const config = JSON.parse(readFileSync(join(projectDir, '.claude', 'grimoire.json'), 'utf-8')) as {
    router: { agents: Record<string, { approaches?: Array<Record<string, unknown>> }> };
  };
  return config.router.agents;
}

function readHooks(projectDir: string): Record<string, Array<{ matcher: string }>> {
  const path = join(projectDir, '.claude', 'settings.local.json');
  if (!existsSync(path)) return {};
  const settings = JSON.parse(readFileSync(path, 'utf-8')) as Record<string, unknown>;
  return (settings['hooks'] ?? {}) as Record<string, Array<{ matcher: string }>>;
}

describe('runAgentApproachesFor', () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = makeTmpDir();
    vi.clearAllMocks();
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  it('should show current approaches and exit on cancel without writing', async () => {
    writeAgent(projectDir, 'my-agent');
    makeManifest(projectDir, {
      'my-agent': { approaches: [{ name: 'tdd', directive: 'Old text.', skill: 's' }] },
    });
    mockMultiselect.mockResolvedValueOnce(CANCEL as never);

    await runAgentApproachesFor(projectDir, 'my-agent');

    expect(vi.mocked(clack.log.info)).toHaveBeenCalledWith(expect.stringContaining('tdd'));
    expect(readAgents(projectDir)['my-agent']!.approaches).toEqual([
      { name: 'tdd', directive: 'Old text.', skill: 's' },
    ]);
  });

  it('should pre-check currently enforced approaches in the multiselect', async () => {
    writeAgent(projectDir, 'my-agent');
    makeManifest(projectDir, {
      'my-agent': { approaches: [{ name: 'tdd', directive: 'Old text.' }] },
    });
    mockMultiselect.mockResolvedValueOnce(CANCEL as never);

    await runAgentApproachesFor(projectDir, 'my-agent');

    const call = mockMultiselect.mock.calls[0]![0] as { initialValues?: string[] };
    expect(call.initialValues).toEqual(['tdd']);
  });

  it('should attach a checked approach with the catalog directive and a selected bound skill', async () => {
    writeAgent(projectDir, 'my-agent');
    writeSkill(projectDir, 'grimoire.unit-testing-dotnet');
    makeManifest(projectDir, { 'my-agent': {} });
    mockMultiselect.mockResolvedValueOnce(['tdd'] as never);
    mockSelect.mockResolvedValueOnce('grimoire.unit-testing-dotnet' as never);
    mockConfirm.mockResolvedValueOnce(true as never);

    await runAgentApproachesFor(projectDir, 'my-agent');

    expect(readAgents(projectDir)['my-agent']!.approaches).toEqual([
      { name: 'tdd', directive: TDD_DIRECTIVE, skill: 'grimoire.unit-testing-dotnet' },
    ]);
  });

  it('should ensure subagent hooks without PreToolUse and without enforcement enabled', async () => {
    writeAgent(projectDir, 'my-agent');
    writeSkill(projectDir, 'grimoire.unit-testing-dotnet');
    makeManifest(projectDir, { 'my-agent': {} });
    mockMultiselect.mockResolvedValueOnce(['tdd'] as never);
    mockSelect.mockResolvedValueOnce('grimoire.unit-testing-dotnet' as never);
    mockConfirm.mockResolvedValueOnce(true as never);

    await runAgentApproachesFor(projectDir, 'my-agent');

    const hooks = readHooks(projectDir);
    expect(hooks['PreToolUse']).toBeUndefined();
    expect(hooks['SubagentStart']!.map((e) => e.matcher)).toEqual(['my-agent']);
    expect(hooks['SubagentStop']!.map((e) => e.matcher)).toEqual(['my-agent']);
  });

  it('should bind silently when exactly one assigned skill matches', async () => {
    writeAgent(projectDir, 'my-agent', { skills: ['grimoire.unit-testing-dotnet'] });
    writeSkill(projectDir, 'grimoire.unit-testing-dotnet');
    makeManifest(projectDir, { 'my-agent': {} });
    mockMultiselect.mockResolvedValueOnce(['tdd'] as never);

    await runAgentApproachesFor(projectDir, 'my-agent');

    expect(mockSelect).not.toHaveBeenCalled();
    expect(mockConfirm).not.toHaveBeenCalled();
    expect(readAgents(projectDir)['my-agent']!.approaches![0]!['skill']).toBe(
      'grimoire.unit-testing-dotnet',
    );
  });

  it('should attach directive-only when "none" is chosen in the bind select', async () => {
    writeAgent(projectDir, 'my-agent');
    writeSkill(projectDir, 'grimoire.unit-testing-dotnet');
    makeManifest(projectDir, { 'my-agent': {} });
    mockMultiselect.mockResolvedValueOnce(['tdd'] as never);
    mockSelect.mockResolvedValueOnce('' as never);

    await runAgentApproachesFor(projectDir, 'my-agent');

    const approach = readAgents(projectDir)['my-agent']!.approaches![0]!;
    expect(approach).not.toHaveProperty('skill');
    expect(mockConfirm).not.toHaveBeenCalled();
  });

  it('should attach directive-only with an info note when no matching skill is installed', async () => {
    writeAgent(projectDir, 'my-agent');
    makeManifest(projectDir, { 'my-agent': {} });
    mockMultiselect.mockResolvedValueOnce(['tdd'] as never);

    await runAgentApproachesFor(projectDir, 'my-agent');

    expect(mockSelect).not.toHaveBeenCalled();
    expect(vi.mocked(clack.log.info)).toHaveBeenCalledWith(expect.stringContaining('No skill matching'));
    expect(readAgents(projectDir)['my-agent']!.approaches![0]!).not.toHaveProperty('skill');
  });

  it('should not silently bind an assigned skill that is not installed', async () => {
    // Frontmatter references a matching skill whose directory does not exist —
    // binding it would mandate a skill the agent can never load.
    writeAgent(projectDir, 'my-agent', { skills: ['grimoire.unit-testing-dotnet'] });
    makeManifest(projectDir, { 'my-agent': {} });
    mockMultiselect.mockResolvedValueOnce(['tdd'] as never);

    await runAgentApproachesFor(projectDir, 'my-agent');

    expect(mockSelect).not.toHaveBeenCalled();
    expect(vi.mocked(clack.log.info)).toHaveBeenCalledWith(expect.stringContaining('No skill matching'));
    expect(readAgents(projectDir)['my-agent']!.approaches![0]!).not.toHaveProperty('skill');
  });

  it('should assign the bound skill to frontmatter on confirm', async () => {
    writeAgent(projectDir, 'my-agent');
    writeSkill(projectDir, 'grimoire.unit-testing-dotnet');
    makeManifest(projectDir, { 'my-agent': {} });
    mockMultiselect.mockResolvedValueOnce(['tdd'] as never);
    mockSelect.mockResolvedValueOnce('grimoire.unit-testing-dotnet' as never);
    mockConfirm.mockResolvedValueOnce(true as never);

    await runAgentApproachesFor(projectDir, 'my-agent');

    const content = readFileSync(join(projectDir, '.claude', 'agents', 'my-agent.md'), 'utf-8');
    expect(content).toContain('grimoire.unit-testing-dotnet');
  });

  it('should not touch frontmatter when the assign confirm is declined', async () => {
    writeAgent(projectDir, 'my-agent');
    writeSkill(projectDir, 'grimoire.unit-testing-dotnet');
    makeManifest(projectDir, { 'my-agent': {} });
    mockMultiselect.mockResolvedValueOnce(['tdd'] as never);
    mockSelect.mockResolvedValueOnce('grimoire.unit-testing-dotnet' as never);
    mockConfirm.mockResolvedValueOnce(false as never);

    await runAgentApproachesFor(projectDir, 'my-agent');

    const content = readFileSync(join(projectDir, '.claude', 'agents', 'my-agent.md'), 'utf-8');
    expect(content).not.toContain('skills:');
    // The approach itself is still bound
    expect(readAgents(projectDir)['my-agent']!.approaches![0]!['skill']).toBe(
      'grimoire.unit-testing-dotnet',
    );
  });

  it('should list assigned matching skills before other installed ones in the bind select', async () => {
    writeAgent(projectDir, 'my-agent', { skills: ['dotnet-unit-testing', 'grimoire.unit-testing-dotnet'] });
    writeSkill(projectDir, 'dotnet-unit-testing');
    writeSkill(projectDir, 'grimoire.unit-testing-dotnet');
    writeSkill(projectDir, 'unit-testing-extra');
    makeManifest(projectDir, { 'my-agent': {} });
    mockMultiselect.mockResolvedValueOnce(['tdd'] as never);
    mockSelect.mockResolvedValueOnce('grimoire.unit-testing-dotnet' as never);

    await runAgentApproachesFor(projectDir, 'my-agent');

    // Two assigned skills match → select is shown, assigned entries first
    const call = mockSelect.mock.calls[0]![0] as { options: Array<{ value: string; hint?: string }> };
    expect(call.options[0]!.hint).toBe('assigned to agent');
    expect(call.options[call.options.length - 1]!.value).toBe('');
  });

  it('should warn when the agent tools line lacks Skill', async () => {
    writeAgent(projectDir, 'my-agent', { skills: ['grimoire.unit-testing-dotnet'], tools: 'Read, Edit' });
    writeSkill(projectDir, 'grimoire.unit-testing-dotnet');
    makeManifest(projectDir, { 'my-agent': {} });
    mockMultiselect.mockResolvedValueOnce(['tdd'] as never);

    await runAgentApproachesFor(projectDir, 'my-agent');

    expect(vi.mocked(clack.log.warn)).toHaveBeenCalledWith(expect.stringContaining('Skill'));
  });

  it('should not warn when the tools line includes Skill or is absent', async () => {
    writeAgent(projectDir, 'my-agent', { skills: ['grimoire.unit-testing-dotnet'], tools: 'Read, Edit, Skill' });
    writeSkill(projectDir, 'grimoire.unit-testing-dotnet');
    makeManifest(projectDir, { 'my-agent': {} });
    mockMultiselect.mockResolvedValueOnce(['tdd'] as never);

    await runAgentApproachesFor(projectDir, 'my-agent');

    expect(vi.mocked(clack.log.warn)).not.toHaveBeenCalled();
  });

  it('should detach unchecked approaches and remove hooks when nothing is left to enforce', async () => {
    writeAgent(projectDir, 'my-agent');
    makeManifest(projectDir, {
      'my-agent': { approaches: [{ name: 'tdd', directive: 'Old text.' }] },
    });
    // Simulate hooks previously installed for this agent
    writeFileSync(
      join(projectDir, '.claude', 'settings.local.json'),
      JSON.stringify({
        hooks: {
          SubagentStart: [{ matcher: 'my-agent', hooks: [{ type: 'command', command: 'npx @grimoire-cc/router --subagent-start' }] }],
          SubagentStop: [{ matcher: 'my-agent', hooks: [{ type: 'command', command: 'npx @grimoire-cc/router --subagent-stop' }] }],
        },
      }),
    );
    mockMultiselect.mockResolvedValueOnce([] as never);

    await runAgentApproachesFor(projectDir, 'my-agent');

    expect(readAgents(projectDir)['my-agent']).not.toHaveProperty('approaches');
    const hooks = readHooks(projectDir);
    expect(hooks['SubagentStart']).toBeUndefined();
    expect(hooks['SubagentStop']).toBeUndefined();
  });

  it('should keep subagent hooks when enforcement is on and the agent still has file_patterns', async () => {
    writeAgent(projectDir, 'my-agent');
    makeManifest(
      projectDir,
      { 'my-agent': { file_patterns: ['*.cs'], approaches: [{ name: 'tdd', directive: 'Old text.' }] } },
      { enforcement: true },
    );
    writeFileSync(
      join(projectDir, '.claude', 'settings.local.json'),
      JSON.stringify({
        hooks: {
          SubagentStart: [{ matcher: 'my-agent', hooks: [{ type: 'command', command: 'npx @grimoire-cc/router --subagent-start' }] }],
          SubagentStop: [{ matcher: 'my-agent', hooks: [{ type: 'command', command: 'npx @grimoire-cc/router --subagent-stop' }] }],
        },
      }),
    );
    mockMultiselect.mockResolvedValueOnce([] as never);

    await runAgentApproachesFor(projectDir, 'my-agent');

    const hooks = readHooks(projectDir);
    expect(hooks['SubagentStart']!.map((e) => e.matcher)).toEqual(['my-agent']);
  });

  it('should remove subagent hooks when patterns exist but enforcement is off', async () => {
    writeAgent(projectDir, 'my-agent');
    makeManifest(projectDir, {
      'my-agent': { file_patterns: ['*.cs'], approaches: [{ name: 'tdd', directive: 'Old text.' }] },
    });
    writeFileSync(
      join(projectDir, '.claude', 'settings.local.json'),
      JSON.stringify({
        hooks: {
          SubagentStart: [{ matcher: 'my-agent', hooks: [{ type: 'command', command: 'npx @grimoire-cc/router --subagent-start' }] }],
        },
      }),
    );
    mockMultiselect.mockResolvedValueOnce([] as never);

    await runAgentApproachesFor(projectDir, 'my-agent');

    expect(readHooks(projectDir)['SubagentStart']).toBeUndefined();
  });

  it('should render unknown configured ids as custom options and allow unchecking them', async () => {
    writeAgent(projectDir, 'my-agent');
    makeManifest(projectDir, {
      'my-agent': { approaches: [{ name: 'custom-x', directive: 'Custom directive.' }] },
    });
    mockMultiselect.mockResolvedValueOnce([] as never);

    await runAgentApproachesFor(projectDir, 'my-agent');

    const call = mockMultiselect.mock.calls[0]![0] as {
      options: Array<{ value: string; hint?: string }>;
      initialValues?: string[];
    };
    const customOption = call.options.find((o) => o.value === 'custom-x');
    expect(customOption?.hint).toBe('custom');
    expect(call.initialValues).toEqual(['custom-x']);
    expect(readAgents(projectDir)['my-agent']).not.toHaveProperty('approaches');
  });

  it('should preserve existing approach entries when adding new ones', async () => {
    writeAgent(projectDir, 'my-agent');
    writeSkill(projectDir, 'grimoire.unit-testing-dotnet');
    makeManifest(projectDir, {
      'my-agent': { approaches: [{ name: 'custom-x', directive: 'Custom directive.' }] },
    });
    mockMultiselect.mockResolvedValueOnce(['custom-x', 'tdd'] as never);
    mockSelect.mockResolvedValueOnce('' as never);

    await runAgentApproachesFor(projectDir, 'my-agent');

    expect(readAgents(projectDir)['my-agent']!.approaches).toEqual([
      { name: 'custom-x', directive: 'Custom directive.' },
      { name: 'tdd', directive: TDD_DIRECTIVE },
    ]);
  });
});

describe('runAgentApproaches (standalone)', () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = makeTmpDir();
    vi.clearAllMocks();
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  it('should show intro, delegate to the flow, and show outro', async () => {
    writeAgent(projectDir, 'my-agent');
    makeManifest(projectDir, { 'my-agent': {} });
    mockSelect.mockResolvedValueOnce('my-agent' as never);
    mockMultiselect.mockResolvedValueOnce(CANCEL as never);

    await runAgentApproaches(projectDir);

    expect(vi.mocked(clack.intro)).toHaveBeenCalledWith('Agent Approaches');
    expect(vi.mocked(clack.outro)).toHaveBeenCalledWith('Done.');
    expect(mockMultiselect).toHaveBeenCalled();
  });

  it('should resolve a non-namespaced agent file to its managed manifest key', async () => {
    // Legacy layout: file csharp-coder.md, manifest key grimoire.csharp-coder.
    // Approaches (and hook matchers) must be written under the manifest key —
    // writing under the bare basename would silently enforce nothing.
    writeAgent(projectDir, 'csharp-coder');
    makeManifest(projectDir, { 'grimoire.csharp-coder': {} });
    mockSelect.mockResolvedValueOnce('grimoire.csharp-coder' as never);
    mockMultiselect.mockResolvedValueOnce(['docs-first'] as never);

    await runAgentApproaches(projectDir);

    const pickerCall = mockSelect.mock.calls[0]![0] as { options: Array<{ value: string }> };
    expect(pickerCall.options.map((o) => o.value)).toEqual(['grimoire.csharp-coder']);

    const agents = readAgents(projectDir);
    expect(agents['grimoire.csharp-coder']!.approaches![0]!['name']).toBe('docs-first');
    expect(agents).not.toHaveProperty('csharp-coder');

    const hooks = readHooks(projectDir);
    expect(hooks['SubagentStart']!.map((e) => e.matcher)).toEqual(['grimoire.csharp-coder']);
  });
});
