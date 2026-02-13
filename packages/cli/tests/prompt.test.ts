import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PackManifest, InstallItem } from '../src/types.js';

vi.mock('@clack/prompts', () => ({
  multiselect: vi.fn(),
  confirm: vi.fn(),
  intro: vi.fn(),
  outro: vi.fn(),
  cancel: vi.fn(),
  isCancel: vi.fn(),
}));

import { promptForItems } from '../src/prompt.js';
import * as clack from '@clack/prompts';

const mockMultiselect = vi.mocked(clack.multiselect);
const mockConfirm = vi.mocked(clack.confirm);
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
    mockConfirm.mockResolvedValue(true);
  });

  it('should return selected items with auto-activation enabled', async () => {
    const expectedItems: InstallItem[] = [
      { type: 'agent', name: 'my-agent', sourcePath: 'agents/my-agent.md', description: 'Agent A' },
    ];
    mockMultiselect.mockResolvedValue(expectedItems);
    mockConfirm.mockResolvedValue(true);

    const result = await promptForItems(manifest);

    expect(result.items).toEqual(expectedItems);
    expect(result.enableAutoActivation).toBe(true);
  });

  it('should return auto-activation disabled when declined', async () => {
    const expectedItems: InstallItem[] = [
      { type: 'agent', name: 'my-agent', sourcePath: 'agents/my-agent.md', description: 'Agent A' },
    ];
    mockMultiselect.mockResolvedValue(expectedItems);
    mockConfirm.mockResolvedValue(false);

    const result = await promptForItems(manifest);

    expect(result.items).toEqual(expectedItems);
    expect(result.enableAutoActivation).toBe(false);
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

  it('should handle multiselect cancellation', async () => {
    mockMultiselect.mockResolvedValue(Symbol('cancel'));
    mockIsCancel.mockReturnValueOnce(true);

    const result = await promptForItems(manifest);

    expect(result).toEqual({ items: [], enableAutoActivation: false });
    expect(mockConfirm).not.toHaveBeenCalled();
  });

  it('should handle confirm cancellation', async () => {
    const items: InstallItem[] = [
      { type: 'agent', name: 'my-agent', sourcePath: 'agents/my-agent.md', description: 'Agent A' },
    ];
    mockMultiselect.mockResolvedValue(items);
    mockConfirm.mockResolvedValue(Symbol('cancel') as never);
    mockIsCancel.mockReturnValueOnce(false).mockReturnValueOnce(true);

    const result = await promptForItems(manifest);

    expect(result).toEqual({ items: [], enableAutoActivation: false });
  });

  it('should skip confirm when no items selected', async () => {
    mockMultiselect.mockResolvedValue([]);

    const result = await promptForItems(manifest);

    expect(result).toEqual({ items: [], enableAutoActivation: false });
    expect(mockConfirm).not.toHaveBeenCalled();
  });
});
