import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PackManifest, InstallItem } from '../src/types.js';

vi.mock('@clack/prompts', () => ({
  multiselect: vi.fn(),
  intro: vi.fn(),
  outro: vi.fn(),
  cancel: vi.fn(),
  isCancel: vi.fn(),
}));

import { promptForItems } from '../src/prompt.js';
import * as clack from '@clack/prompts';

const mockMultiselect = vi.mocked(clack.multiselect);
const mockIsCancel = vi.mocked(clack.isCancel);

describe('promptForItems', () => {
  const manifest: PackManifest = {
    name: 'test-pack',
    version: '1.0.0',
    agents: [
      { name: 'my-agent', path: 'agents/my-agent.md', description: 'Agent A' },
    ],
    skills: [
      { name: 'my-skill', path: 'skills/my-skill', description: 'Skill S' },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockIsCancel.mockReturnValue(false);
  });

  it('should return selected items from multiselect', async () => {
    const expectedItems: InstallItem[] = [
      { type: 'agent', name: 'my-agent', sourcePath: 'agents/my-agent.md', description: 'Agent A' },
    ];
    mockMultiselect.mockResolvedValue(expectedItems);

    const result = await promptForItems(manifest);

    expect(result).toEqual(expectedItems);
  });

  it('should build correct options list from manifest', async () => {
    mockMultiselect.mockResolvedValue([]);

    await promptForItems(manifest);

    expect(mockMultiselect).toHaveBeenCalledTimes(1);
    const call = mockMultiselect.mock.calls[0]?.[0] as { options: Array<{ label: string; value: InstallItem }> };
    const labels = call.options.map((o) => o.label);
    expect(labels).toContain('[agent] my-agent');
    expect(labels).toContain('[skill] my-skill');
  });

  it('should handle user cancellation', async () => {
    mockMultiselect.mockResolvedValue(Symbol('cancel'));
    mockIsCancel.mockReturnValue(true);

    const result = await promptForItems(manifest);

    expect(result).toEqual([]);
  });
});
