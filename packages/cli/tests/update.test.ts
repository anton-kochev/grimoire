import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

vi.mock('../src/resolve.js', () => ({
  loadAllPacks: vi.fn(),
}));

vi.mock('@clack/prompts', () => ({
  intro: vi.fn(),
  outro: vi.fn(),
  note: vi.fn(),
  multiselect: vi.fn(),
  isCancel: vi.fn(() => false),
  cancel: vi.fn(),
}));

import { checkUpdates, runUpdate } from '../src/commands/update.js';
import { loadAllPacks } from '../src/resolve.js';
import * as clack from '@clack/prompts';
import type { PackOption } from '../src/types.js';

const mockLoadAllPacks = vi.mocked(loadAllPacks);
const mockMultiselect = vi.mocked(clack.multiselect);

function makeTmpDir(prefix: string): string {
  const raw = join(tmpdir(), `grimoire-update-${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(raw, { recursive: true });
  return realpathSync(raw);
}

function setupProjectWithVersions(
  projectDir: string,
  agents: Array<{ name: string; version: string }>,
  skills: Array<{ name: string; version: string }>,
): void {
  const agentsDir = join(projectDir, '.claude', 'agents');
  const skillsDir = join(projectDir, '.claude', 'skills');
  mkdirSync(agentsDir, { recursive: true });

  for (const agent of agents) {
    writeFileSync(
      join(agentsDir, `${agent.name}.md`),
      `---\nname: ${agent.name}\ndescription: Test agent\nversion: ${agent.version}\n---\n\n# Body`,
    );
  }

  for (const skill of skills) {
    mkdirSync(join(skillsDir, skill.name), { recursive: true });
    writeFileSync(
      join(skillsDir, skill.name, 'SKILL.md'),
      `---\nname: ${skill.name}\ndescription: Test skill\nversion: ${skill.version}\n---\n\n# Body`,
    );
  }

  // Write manifest so scanInstalled recognises these as grimoire-managed
  const claudeDir = join(projectDir, '.claude');
  mkdirSync(claudeDir, { recursive: true });
  writeFileSync(
    join(claudeDir, 'skills-manifest.json'),
    JSON.stringify({
      version: '1',
      config: {},
      skills: skills.map((s) => ({ name: s.name, path: `.claude/skills/${s.name}` })),
      agents: Object.fromEntries(agents.map((a) => [a.name, {}])),
    }, null, 2),
  );
}

function makePack(overrides?: Partial<PackOption>): PackOption {
  return {
    name: 'test-pack',
    dir: '/fake/pack',
    manifest: {
      name: 'test-pack',
      version: '1.0.0',
      agents: [
        { name: 'my-agent', path: 'agents/my-agent.md', description: 'Agent', version: '1.1.0' },
      ],
      skills: [
        { name: 'my-skill', path: 'skills/my-skill', description: 'Skill', version: '1.0.0' },
      ],
    },
    ...overrides,
  };
}

describe('checkUpdates', () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = makeTmpDir('check');
    vi.clearAllMocks();
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  it('detects outdated agent', () => {
    setupProjectWithVersions(projectDir, [{ name: 'my-agent', version: '1.0.0' }], []);
    mockLoadAllPacks.mockReturnValue([makePack()]);

    const results = checkUpdates(projectDir);
    const agentResult = results.find((r) => r.item.name === 'my-agent');

    expect(agentResult?.hasUpdate).toBe(true);
    expect(agentResult?.installedVersion).toBe('1.0.0');
    expect(agentResult?.availableVersion).toBe('1.1.0');
  });

  it('marks up-to-date item as no update', () => {
    setupProjectWithVersions(projectDir, [], [{ name: 'my-skill', version: '1.0.0' }]);
    mockLoadAllPacks.mockReturnValue([makePack()]);

    const results = checkUpdates(projectDir);
    const skillResult = results.find((r) => r.item.name === 'my-skill');

    expect(skillResult?.hasUpdate).toBe(false);
    expect(skillResult?.installedVersion).toBe('1.0.0');
    expect(skillResult?.availableVersion).toBe('1.0.0');
  });

  it('handles installed item not found in any pack', () => {
    setupProjectWithVersions(projectDir, [{ name: 'unknown-agent', version: '1.0.0' }], []);
    mockLoadAllPacks.mockReturnValue([makePack()]);

    const results = checkUpdates(projectDir);
    const result = results.find((r) => r.item.name === 'unknown-agent');

    expect(result?.hasUpdate).toBe(false);
    expect(result?.availableVersion).toBeUndefined();
  });
});

describe('runUpdate', () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = makeTmpDir('run');
    vi.clearAllMocks();
    vi.mocked(clack.isCancel).mockReturnValue(false);
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  it('outputs up-to-date message when nothing to update', async () => {
    setupProjectWithVersions(projectDir, [{ name: 'my-agent', version: '1.1.0' }], []);
    mockLoadAllPacks.mockReturnValue([makePack()]);

    await runUpdate(projectDir);

    expect(clack.outro).toHaveBeenCalledWith('All items are up to date.');
    expect(clack.multiselect).not.toHaveBeenCalled();
  });

  it('shows updates and calls multiselect when outdated items exist', async () => {
    setupProjectWithVersions(projectDir, [{ name: 'my-agent', version: '1.0.0' }], []);
    mockLoadAllPacks.mockReturnValue([makePack()]);
    // Return empty selection — user deselects everything
    mockMultiselect.mockResolvedValue([]);

    await runUpdate(projectDir);

    expect(clack.note).toHaveBeenCalled();
    expect(clack.multiselect).toHaveBeenCalled();
    expect(clack.outro).toHaveBeenCalledWith('Nothing selected.');
  });

  it('cancels gracefully when user cancels multiselect', async () => {
    setupProjectWithVersions(projectDir, [{ name: 'my-agent', version: '1.0.0' }], []);
    mockLoadAllPacks.mockReturnValue([makePack()]);
    mockMultiselect.mockResolvedValue(Symbol('cancel') as unknown as never);
    vi.mocked(clack.isCancel).mockReturnValue(true);

    await runUpdate(projectDir);

    expect(clack.cancel).toHaveBeenCalledWith('Update cancelled.');
    expect(clack.outro).not.toHaveBeenCalled();
  });
});
