import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PackOption, InstallItem } from '../src/types.js';

vi.mock('@clack/prompts', () => ({
  multiselect: vi.fn(),
  groupMultiselect: vi.fn(),
  confirm: vi.fn(),
  intro: vi.fn(),
  outro: vi.fn(),
  cancel: vi.fn(),
  isCancel: vi.fn(),
}));

vi.mock('../src/grimoire-config.js', () => ({
  readGrimoireConfig: vi.fn().mockReturnValue({}),
  isNewer: vi.fn().mockReturnValue(false),
}));

import { runWizard, runRemoveWizard } from '../src/prompt.js';
import * as clack from '@clack/prompts';
import { readGrimoireConfig, isNewer } from '../src/grimoire-config.js';

const mockMultiselect = vi.mocked(clack.multiselect);
const mockGroupMultiselect = vi.mocked(clack.groupMultiselect);
const mockConfirm = vi.mocked(clack.confirm);
const mockIsCancel = vi.mocked(clack.isCancel);
const mockReadConfig = vi.mocked(readGrimoireConfig);
const mockIsNewer = vi.mocked(isNewer);

describe('runWizard', () => {
  const packs: PackOption[] = [
    {
      name: 'dotnet-pack',
      dir: '/packs/dotnet-pack',
      manifest: {
        name: 'dotnet-pack',
        version: '1.0.0',
        agents: [
          { name: 'csharp-coder', path: 'agents/csharp-coder.md', description: 'C# coder', version: '1.0.0' },
        ],
        skills: [
          { name: 'dotnet-workflow', path: 'skills/dotnet-workflow', description: 'Dotnet workflow', version: '1.0.0' },
        ],
      },
    },
    {
      name: 'ts-pack',
      dir: '/packs/ts-pack',
      manifest: {
        name: 'ts-pack',
        version: '2.0.0',
        agents: [],
        skills: [
          { name: 'modern-ts', path: 'skills/modern-ts', description: 'Modern TypeScript', version: '2.0.0' },
        ],
      },
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockIsCancel.mockReturnValue(false);
    mockReadConfig.mockReturnValue({});
    mockIsNewer.mockReturnValue(false);
  });

  // --- Happy path ---

  it('should return selections grouped by pack with auto-activation', async () => {
    // Arrange: groupMultiselect returns items from both packs
    const selectedItems = [
      { pack: packs[0], item: { type: 'agent' as const, name: 'csharp-coder', sourcePath: 'agents/csharp-coder.md', description: 'C# coder', pack: 'dotnet-pack', version: '1.0.0' } },
      { pack: packs[0], item: { type: 'skill' as const, name: 'dotnet-workflow', sourcePath: 'skills/dotnet-workflow', description: 'Dotnet workflow', pack: 'dotnet-pack', version: '1.0.0' } },
      { pack: packs[1], item: { type: 'skill' as const, name: 'modern-ts', sourcePath: 'skills/modern-ts', description: 'Modern TypeScript', pack: 'ts-pack', version: '2.0.0' } },
    ];
    mockGroupMultiselect.mockResolvedValueOnce(selectedItems);
    mockConfirm.mockResolvedValueOnce(true);

    // Act
    const result = await runWizard(packs, '/test/project');

    // Assert
    expect(result.enableAutoActivation).toBe(true);
    expect(result.selections).toHaveLength(2);
    expect(result.selections[0]?.items).toHaveLength(2);
    expect(result.selections[0]?.packDir).toBe('/packs/dotnet-pack');
    expect(result.selections[1]?.items).toHaveLength(1);
    expect(result.selections[1]?.packDir).toBe('/packs/ts-pack');
  });

  it('should return auto-activation disabled when declined', async () => {
    // Arrange
    const selectedItems = [
      { pack: packs[0], item: { type: 'agent' as const, name: 'csharp-coder', sourcePath: 'agents/csharp-coder.md', description: 'C# coder', pack: 'dotnet-pack', version: '1.0.0' } },
    ];
    mockGroupMultiselect.mockResolvedValueOnce(selectedItems);
    mockConfirm.mockResolvedValueOnce(false);

    // Act
    const result = await runWizard(packs, '/test/project');

    // Assert
    expect(result.enableAutoActivation).toBe(false);
    expect(result.selections).toHaveLength(1);
  });

  // --- UI structure ---

  it('should build grouped options with pack names as group keys', async () => {
    // Arrange
    mockGroupMultiselect.mockResolvedValueOnce(Symbol('cancel'));
    mockIsCancel.mockReturnValueOnce(true);

    // Act
    await runWizard(packs, '/test/project');

    // Assert
    const call = mockGroupMultiselect.mock.calls[0]?.[0] as {
      options: Record<string, Array<{ label: string; hint: string }>>;
    };
    const groups = call.options;
    expect(Object.keys(groups)).toContain('dotnet-pack');
    expect(Object.keys(groups)).toContain('ts-pack');

    const dotnetLabels = groups['dotnet-pack']!.map((o) => o.label);
    expect(dotnetLabels).toContain('[agent · v1.0.0] csharp-coder');
    expect(dotnetLabels).toContain('[skill · v1.0.0] dotnet-workflow');

    const tsLabels = groups['ts-pack']!.map((o) => o.label);
    expect(tsLabels).toContain('[skill · v2.0.0] modern-ts');
  });

  it('should include items from all packs in group options', async () => {
    // Arrange
    mockGroupMultiselect.mockResolvedValueOnce(Symbol('cancel'));
    mockIsCancel.mockReturnValueOnce(true);

    // Act
    await runWizard(packs, '/test/project');

    // Assert
    const call = mockGroupMultiselect.mock.calls[0]?.[0] as {
      options: Record<string, Array<{ label: string }>>;
    };
    const allItems = Object.values(call.options).flat();
    expect(allItems).toHaveLength(3); // 1 agent + 1 skill from dotnet-pack, 1 skill from ts-pack
  });

  it('should pre-select all items via initialValues', async () => {
    // Arrange
    mockGroupMultiselect.mockResolvedValueOnce(Symbol('cancel'));
    mockIsCancel.mockReturnValueOnce(true);

    // Act
    await runWizard(packs, '/test/project');

    // Assert
    const call = mockGroupMultiselect.mock.calls[0]?.[0] as { initialValues: unknown[] };
    expect(call.initialValues).toHaveLength(3);
  });

  it('should not call multiselect at all', async () => {
    // Arrange
    mockGroupMultiselect.mockResolvedValueOnce(Symbol('cancel'));
    mockIsCancel.mockReturnValueOnce(true);

    // Act
    await runWizard(packs, '/test/project');

    // Assert
    expect(mockMultiselect).not.toHaveBeenCalled();
  });

  // --- Cancellation / empty ---

  it('should handle groupMultiselect cancellation', async () => {
    // Arrange
    mockGroupMultiselect.mockResolvedValueOnce(Symbol('cancel'));
    mockIsCancel.mockReturnValueOnce(true);

    // Act
    const result = await runWizard(packs, '/test/project');

    // Assert
    expect(result).toEqual({ selections: [], enableAutoActivation: false });
    expect(mockConfirm).not.toHaveBeenCalled();
  });

  it('should handle confirm cancellation', async () => {
    // Arrange
    const selectedItems = [
      { pack: packs[0], item: { type: 'agent' as const, name: 'csharp-coder', sourcePath: 'agents/csharp-coder.md', description: 'C# coder', pack: 'dotnet-pack', version: '1.0.0' } },
    ];
    mockGroupMultiselect.mockResolvedValueOnce(selectedItems);
    mockConfirm.mockResolvedValueOnce(Symbol('cancel') as never);
    mockIsCancel.mockReturnValueOnce(false).mockReturnValueOnce(true);

    // Act
    const result = await runWizard(packs, '/test/project');

    // Assert
    expect(result).toEqual({ selections: [], enableAutoActivation: false });
  });

  it('should return empty when no items selected', async () => {
    // Arrange
    mockGroupMultiselect.mockResolvedValueOnce([]);

    // Act
    const result = await runWizard(packs, '/test/project');

    // Assert
    expect(result).toEqual({ selections: [], enableAutoActivation: false });
    expect(mockConfirm).not.toHaveBeenCalled();
  });

  // --- Edge cases ---

  it('should handle single pack with mixed agents and skills', async () => {
    // Arrange
    const singlePack: PackOption[] = [packs[0]!];
    mockGroupMultiselect.mockResolvedValueOnce(Symbol('cancel'));
    mockIsCancel.mockReturnValueOnce(true);

    // Act
    await runWizard(singlePack, '/test/project');

    // Assert
    const call = mockGroupMultiselect.mock.calls[0]?.[0] as {
      options: Record<string, Array<{ label: string }>>;
    };
    expect(Object.keys(call.options)).toEqual(['dotnet-pack']);
    expect(call.options['dotnet-pack']).toHaveLength(2);
  });

  it('should handle pack with only agents (no skills)', async () => {
    // Arrange
    const agentOnlyPack: PackOption[] = [{
      name: 'agent-pack',
      dir: '/packs/agent-pack',
      manifest: {
        name: 'agent-pack',
        version: '1.0.0',
        agents: [{ name: 'my-agent', path: 'agents/my-agent.md', description: 'An agent' }],
        skills: [],
      },
    }];
    mockGroupMultiselect.mockResolvedValueOnce(Symbol('cancel'));
    mockIsCancel.mockReturnValueOnce(true);

    // Act
    await runWizard(agentOnlyPack, '/test/project');

    // Assert
    const call = mockGroupMultiselect.mock.calls[0]?.[0] as {
      options: Record<string, Array<{ label: string }>>;
    };
    expect(Object.keys(call.options)).toEqual(['agent-pack']);
    expect(call.options['agent-pack']).toHaveLength(1);
    expect(call.options['agent-pack']![0]!.label).toContain('[agent]');
  });

  it('should handle pack with only skills (no agents)', async () => {
    // Arrange
    const skillOnlyPack: PackOption[] = [packs[1]!]; // ts-pack has no agents
    mockGroupMultiselect.mockResolvedValueOnce(Symbol('cancel'));
    mockIsCancel.mockReturnValueOnce(true);

    // Act
    await runWizard(skillOnlyPack, '/test/project');

    // Assert
    const call = mockGroupMultiselect.mock.calls[0]?.[0] as {
      options: Record<string, Array<{ label: string }>>;
    };
    expect(Object.keys(call.options)).toEqual(['ts-pack']);
    expect(call.options['ts-pack']).toHaveLength(1);
    expect(call.options['ts-pack']![0]!.label).toContain('[skill');
  });

  // --- Version hints ---

  it('should show installed version hint when item is already installed', async () => {
    // Arrange
    mockReadConfig.mockReturnValue({ installed: { 'csharp-coder': { version: '0.9.0', pack: 'dotnet-pack' } } });
    mockIsNewer.mockReturnValue(true); // pack version is newer
    mockGroupMultiselect.mockResolvedValueOnce(Symbol('cancel'));
    mockIsCancel.mockReturnValueOnce(true);

    // Act
    await runWizard(packs, '/test/project');

    // Assert
    const call = mockGroupMultiselect.mock.calls[0]?.[0] as {
      options: Record<string, Array<{ hint: string }>>;
    };
    const dotnetHints = call.options['dotnet-pack']!.map((o) => o.hint);
    expect(dotnetHints[0]).toContain('installed: v0.9.0');
    expect(dotnetHints[0]).toContain('C# coder');
  });

  it('should show up-to-date hint when installed version matches', async () => {
    // Arrange
    mockReadConfig.mockReturnValue({ installed: { 'csharp-coder': { version: '1.0.0', pack: 'dotnet-pack' } } });
    mockIsNewer.mockReturnValue(false); // not newer = up to date
    mockGroupMultiselect.mockResolvedValueOnce(Symbol('cancel'));
    mockIsCancel.mockReturnValueOnce(true);

    // Act
    await runWizard(packs, '/test/project');

    // Assert
    const call = mockGroupMultiselect.mock.calls[0]?.[0] as {
      options: Record<string, Array<{ hint: string }>>;
    };
    const dotnetHints = call.options['dotnet-pack']!.map((o) => o.hint);
    expect(dotnetHints[0]).toContain('installed: v1.0.0 (up to date)');
  });
});

describe('runRemoveWizard', () => {
  const installedItems: InstallItem[] = [
    { type: 'agent', name: 'csharp-coder', sourcePath: 'agents/csharp-coder.md', description: 'C# coder', pack: 'dotnet-pack' },
    { type: 'skill', name: 'dotnet-testing', sourcePath: 'skills/dotnet-testing', description: 'Dotnet testing', pack: 'dotnet-pack' },
    { type: 'agent', name: 'dotnet-architect', sourcePath: 'agents/dotnet-architect.md', description: 'Architect' },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockIsCancel.mockReturnValue(false);
  });

  it('should group items by pack name with type-prefixed labels', async () => {
    // Arrange
    mockGroupMultiselect.mockResolvedValueOnce([]);

    // Act
    await runRemoveWizard(installedItems);

    // Assert
    const call = mockGroupMultiselect.mock.calls[0]?.[0] as {
      options: Record<string, Array<{ label: string; value: InstallItem }>>;
    };
    const groups = call.options;
    expect(Object.keys(groups)).toContain('dotnet-pack');
    expect(Object.keys(groups)).toContain('other');

    const dotnetLabels = groups['dotnet-pack']!.map((o) => o.label);
    expect(dotnetLabels).toContain('[agent] csharp-coder');
    expect(dotnetLabels).toContain('[skill] dotnet-testing');

    const otherLabels = groups['other']!.map((o) => o.label);
    expect(otherLabels).toContain('[agent] dotnet-architect');
  });

  it('should return selected items when confirmed', async () => {
    // Arrange
    const toRemove = [installedItems[0]!, installedItems[1]!];
    mockGroupMultiselect.mockResolvedValueOnce(toRemove);
    mockConfirm.mockResolvedValueOnce(true);

    // Act
    const result = await runRemoveWizard(installedItems);

    // Assert
    expect(result.items).toEqual(toRemove);
  });

  it('should return empty items when multiselect is cancelled', async () => {
    // Arrange
    mockGroupMultiselect.mockResolvedValueOnce(Symbol('cancel'));
    mockIsCancel.mockReturnValueOnce(true);

    // Act
    const result = await runRemoveWizard(installedItems);

    // Assert
    expect(result).toEqual({ items: [] });
    expect(mockConfirm).not.toHaveBeenCalled();
  });

  it('should return empty items when nothing is selected', async () => {
    // Arrange
    mockGroupMultiselect.mockResolvedValueOnce([]);

    // Act
    const result = await runRemoveWizard(installedItems);

    // Assert
    expect(result).toEqual({ items: [] });
    expect(mockConfirm).not.toHaveBeenCalled();
  });

  it('should return empty items when confirm is declined', async () => {
    // Arrange
    mockGroupMultiselect.mockResolvedValueOnce([installedItems[0]!]);
    mockConfirm.mockResolvedValueOnce(false);

    // Act
    const result = await runRemoveWizard(installedItems);

    // Assert
    expect(result).toEqual({ items: [] });
  });

  it('should return empty items when confirm is cancelled', async () => {
    // Arrange
    mockGroupMultiselect.mockResolvedValueOnce([installedItems[0]!]);
    mockConfirm.mockResolvedValueOnce(Symbol('cancel') as never);
    mockIsCancel.mockReturnValueOnce(false).mockReturnValueOnce(true);

    // Act
    const result = await runRemoveWizard(installedItems);

    // Assert
    expect(result).toEqual({ items: [] });
  });
});
