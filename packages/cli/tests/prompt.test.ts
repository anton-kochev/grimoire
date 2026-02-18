import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PackOption, InstallItem } from '../src/types.js';

vi.mock('@clack/prompts', () => ({
  multiselect: vi.fn(),
  confirm: vi.fn(),
  intro: vi.fn(),
  outro: vi.fn(),
  cancel: vi.fn(),
  isCancel: vi.fn(),
}));

import { runWizard, runRemoveWizard } from '../src/prompt.js';
import * as clack from '@clack/prompts';

const mockMultiselect = vi.mocked(clack.multiselect);
const mockConfirm = vi.mocked(clack.confirm);
const mockIsCancel = vi.mocked(clack.isCancel);

describe('runWizard', () => {
  const packs: PackOption[] = [
    {
      name: 'dotnet-pack',
      dir: '/packs/dotnet-pack',
      manifest: {
        name: 'dotnet-pack',
        version: '1.0.0',
        agents: [
          { name: 'csharp-coder', path: 'agents/csharp-coder.md', description: 'C# coder' },
        ],
        skills: [
          { name: 'dotnet-workflow', path: 'skills/dotnet-workflow', description: 'Dotnet workflow' },
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
          { name: 'modern-ts', path: 'skills/modern-ts', description: 'Modern TypeScript' },
        ],
      },
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockIsCancel.mockReturnValue(false);
  });

  it('should return selections grouped by pack with auto-activation', async () => {
    // Step 1: select both packs
    mockMultiselect.mockResolvedValueOnce(packs);

    // Step 2: select all items (the wizard builds item options from selected packs)
    const expectedItems = [
      { pack: packs[0], item: { type: 'agent' as const, name: 'csharp-coder', sourcePath: 'agents/csharp-coder.md', description: 'C# coder' } },
      { pack: packs[0], item: { type: 'skill' as const, name: 'dotnet-workflow', sourcePath: 'skills/dotnet-workflow', description: 'Dotnet workflow' } },
      { pack: packs[1], item: { type: 'skill' as const, name: 'modern-ts', sourcePath: 'skills/modern-ts', description: 'Modern TypeScript' } },
    ];
    mockMultiselect.mockResolvedValueOnce(expectedItems);

    // Step 3: enable auto-activation
    mockConfirm.mockResolvedValue(true);

    const result = await runWizard(packs);

    expect(result.enableAutoActivation).toBe(true);
    expect(result.selections).toHaveLength(2);
    expect(result.selections[0]?.items).toHaveLength(2);
    expect(result.selections[0]?.packDir).toBe('/packs/dotnet-pack');
    expect(result.selections[1]?.items).toHaveLength(1);
    expect(result.selections[1]?.packDir).toBe('/packs/ts-pack');
  });

  it('should return auto-activation disabled when declined', async () => {
    mockMultiselect.mockResolvedValueOnce([packs[0]]);
    mockMultiselect.mockResolvedValueOnce([
      { pack: packs[0], item: { type: 'agent' as const, name: 'csharp-coder', sourcePath: 'agents/csharp-coder.md', description: 'C# coder' } },
    ]);
    mockConfirm.mockResolvedValue(false);

    const result = await runWizard(packs);

    expect(result.enableAutoActivation).toBe(false);
    expect(result.selections).toHaveLength(1);
  });

  it('should build correct pack options with hints', async () => {
    mockMultiselect.mockResolvedValueOnce([]);
    mockIsCancel.mockReturnValueOnce(true);

    await runWizard(packs);

    const call = mockMultiselect.mock.calls[0]?.[0] as { options: Array<{ label: string; hint: string }> };
    expect(call.options[0]?.label).toBe('dotnet-pack');
    expect(call.options[0]?.hint).toBe('1 agent, 1 skill');
    expect(call.options[1]?.label).toBe('ts-pack');
    expect(call.options[1]?.hint).toBe('1 skill');
  });

  it('should build item options with pack name prefix', async () => {
    mockMultiselect.mockResolvedValueOnce(packs);
    mockMultiselect.mockResolvedValueOnce([]);
    // Empty selection → returns empty without reaching confirm

    await runWizard(packs);

    const call = mockMultiselect.mock.calls[1]?.[0] as { options: Array<{ label: string }> };
    const labels = call.options.map((o) => o.label);
    expect(labels).toContain('[dotnet-pack | agent] csharp-coder');
    expect(labels).toContain('[dotnet-pack | skill] dotnet-workflow');
    expect(labels).toContain('[ts-pack | skill] modern-ts');
  });

  it('should pre-select all items via initialValues', async () => {
    mockMultiselect.mockResolvedValueOnce(packs);
    mockMultiselect.mockResolvedValueOnce([]);

    await runWizard(packs);

    const call = mockMultiselect.mock.calls[1]?.[0] as { initialValues: unknown[] };
    expect(call.initialValues).toHaveLength(3);
  });

  it('should handle pack selection cancellation', async () => {
    mockMultiselect.mockResolvedValueOnce(Symbol('cancel'));
    mockIsCancel.mockReturnValueOnce(true);

    const result = await runWizard(packs);

    expect(result).toEqual({ selections: [], enableAutoActivation: false });
    expect(mockMultiselect).toHaveBeenCalledTimes(1);
    expect(mockConfirm).not.toHaveBeenCalled();
  });

  it('should handle item selection cancellation', async () => {
    mockMultiselect.mockResolvedValueOnce(packs);
    mockMultiselect.mockResolvedValueOnce(Symbol('cancel'));
    mockIsCancel.mockReturnValueOnce(false).mockReturnValueOnce(true);

    const result = await runWizard(packs);

    expect(result).toEqual({ selections: [], enableAutoActivation: false });
    expect(mockConfirm).not.toHaveBeenCalled();
  });

  it('should handle confirm cancellation', async () => {
    mockMultiselect.mockResolvedValueOnce([packs[0]]);
    mockMultiselect.mockResolvedValueOnce([
      { pack: packs[0], item: { type: 'agent' as const, name: 'csharp-coder', sourcePath: 'agents/csharp-coder.md', description: 'C# coder' } },
    ]);
    mockConfirm.mockResolvedValue(Symbol('cancel') as never);
    mockIsCancel.mockReturnValueOnce(false).mockReturnValueOnce(false).mockReturnValueOnce(true);

    const result = await runWizard(packs);

    expect(result).toEqual({ selections: [], enableAutoActivation: false });
  });

  it('should return empty when no items selected', async () => {
    mockMultiselect.mockResolvedValueOnce(packs);
    mockMultiselect.mockResolvedValueOnce([]);

    const result = await runWizard(packs);

    expect(result).toEqual({ selections: [], enableAutoActivation: false });
    expect(mockConfirm).not.toHaveBeenCalled();
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

  it('should show pack-prefixed labels for known pack items and plain labels for others', async () => {
    // Arrange
    mockMultiselect.mockResolvedValueOnce([]);

    // Act
    await runRemoveWizard(installedItems);

    // Assert
    const call = mockMultiselect.mock.calls[0]?.[0] as { options: Array<{ label: string; value: InstallItem }> };
    const labels = call.options.map((o) => o.label);
    expect(labels).toContain('[dotnet-pack | agent] csharp-coder');
    expect(labels).toContain('[dotnet-pack | skill] dotnet-testing');
    expect(labels).toContain('[agent] dotnet-architect');
    expect(labels).toHaveLength(3);
  });

  it('should return selected items when confirmed', async () => {
    // Arrange
    const toRemove = [installedItems[0]!, installedItems[1]!];
    mockMultiselect.mockResolvedValueOnce(toRemove);
    mockConfirm.mockResolvedValueOnce(true);

    // Act
    const result = await runRemoveWizard(installedItems);

    // Assert
    expect(result.items).toEqual(toRemove);
  });

  it('should return empty items when multiselect is cancelled', async () => {
    // Arrange
    mockMultiselect.mockResolvedValueOnce(Symbol('cancel'));
    mockIsCancel.mockReturnValueOnce(true);

    // Act
    const result = await runRemoveWizard(installedItems);

    // Assert
    expect(result).toEqual({ items: [] });
    expect(mockConfirm).not.toHaveBeenCalled();
  });

  it('should return empty items when nothing is selected', async () => {
    // Arrange
    mockMultiselect.mockResolvedValueOnce([]);

    // Act
    const result = await runRemoveWizard(installedItems);

    // Assert
    expect(result).toEqual({ items: [] });
    expect(mockConfirm).not.toHaveBeenCalled();
  });

  it('should return empty items when confirm is declined', async () => {
    // Arrange
    mockMultiselect.mockResolvedValueOnce([installedItems[0]!]);
    mockConfirm.mockResolvedValueOnce(false);

    // Act
    const result = await runRemoveWizard(installedItems);

    // Assert
    expect(result).toEqual({ items: [] });
  });

  it('should return empty items when confirm is cancelled', async () => {
    // Arrange
    mockMultiselect.mockResolvedValueOnce([installedItems[0]!]);
    mockConfirm.mockResolvedValueOnce(Symbol('cancel') as never);
    mockIsCancel.mockReturnValueOnce(false).mockReturnValueOnce(true);

    // Act
    const result = await runRemoveWizard(installedItems);

    // Assert
    expect(result).toEqual({ items: [] });
  });
});
