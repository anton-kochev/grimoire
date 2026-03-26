import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, realpathSync, rmSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

vi.mock('@clack/prompts', () => ({
  intro: vi.fn(),
  outro: vi.fn(),
  cancel: vi.fn(),
  log: { warn: vi.fn(), error: vi.fn(), message: vi.fn(), info: vi.fn(), success: vi.fn() },
  select: vi.fn(),
  multiselect: vi.fn(),
  text: vi.fn(),
  isCancel: vi.fn((v: unknown) => v === Symbol.for('clack.cancel')),
}));

import * as clack from '@clack/prompts';
import { runAgentPathsFor } from '../src/commands/agent-paths.js';

const CANCEL = Symbol.for('clack.cancel');
const mockSelect = vi.mocked(clack.select);
const mockMultiselect = vi.mocked(clack.multiselect);
const mockText = vi.mocked(clack.text);

function makeTmpDir(): string {
  const raw = join(tmpdir(), `grimoire-agent-paths-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(raw, { recursive: true });
  return realpathSync(raw);
}

function writeManifest(
  projectDir: string,
  agents: Record<string, { file_patterns?: string[] }>,
): void {
  const claudeDir = join(projectDir, '.claude');
  mkdirSync(claudeDir, { recursive: true });
  writeFileSync(
    join(claudeDir, 'skills-manifest.json'),
    JSON.stringify({ version: '1', config: {}, skills: [], agents }, null, 2),
  );
}

function readManifestAgents(projectDir: string): Record<string, { file_patterns?: string[] }> {
  const raw = readFileSync(join(projectDir, '.claude', 'skills-manifest.json'), 'utf-8');
  return (JSON.parse(raw) as { agents: Record<string, { file_patterns?: string[] }> }).agents;
}

describe('runAgentPathsFor', () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = makeTmpDir();
    vi.clearAllMocks();
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  it('should show current paths and exit on done', async () => {
    writeManifest(projectDir, { 'my-agent': { file_patterns: ['*.ts', '*.tsx'] } });
    mockSelect.mockResolvedValueOnce('done' as never);

    await runAgentPathsFor(projectDir, 'my-agent');

    expect(vi.mocked(clack.log.info)).toHaveBeenCalledWith(
      expect.stringContaining('*.ts'),
    );
    expect(vi.mocked(clack.log.info)).toHaveBeenCalledWith(
      expect.stringContaining('*.tsx'),
    );
  });

  it('should show "no paths" message when none exist', async () => {
    writeManifest(projectDir, { 'my-agent': {} });
    mockSelect.mockResolvedValueOnce('done' as never);

    await runAgentPathsFor(projectDir, 'my-agent');

    expect(vi.mocked(clack.log.info)).toHaveBeenCalledWith(
      expect.stringContaining('No enforcement paths configured'),
    );
  });

  it('should exit on cancel', async () => {
    writeManifest(projectDir, { 'my-agent': {} });
    mockSelect.mockResolvedValueOnce(CANCEL as never);

    await runAgentPathsFor(projectDir, 'my-agent');

    // Should not throw, just return
  });

  it('should not call intro or outro', async () => {
    writeManifest(projectDir, { 'my-agent': {} });
    mockSelect.mockResolvedValueOnce('done' as never);

    await runAgentPathsFor(projectDir, 'my-agent');

    expect(vi.mocked(clack.intro)).not.toHaveBeenCalled();
    expect(vi.mocked(clack.outro)).not.toHaveBeenCalled();
  });

  it('should add path via text input and save to manifest', async () => {
    writeManifest(projectDir, { 'my-agent': {} });
    mockSelect.mockResolvedValueOnce('add' as never);
    mockText.mockResolvedValueOnce('*.vue' as never);

    await runAgentPathsFor(projectDir, 'my-agent');

    const agents = readManifestAgents(projectDir);
    expect(agents['my-agent']!.file_patterns).toEqual(['*.vue']);
    expect(vi.mocked(clack.log.success)).toHaveBeenCalled();
  });

  it('should append to existing patterns when adding', async () => {
    writeManifest(projectDir, { 'my-agent': { file_patterns: ['*.ts'] } });
    mockSelect.mockResolvedValueOnce('add' as never);
    mockText.mockResolvedValueOnce('*.tsx' as never);

    await runAgentPathsFor(projectDir, 'my-agent');

    const agents = readManifestAgents(projectDir);
    expect(agents['my-agent']!.file_patterns).toEqual(['*.ts', '*.tsx']);
  });

  it('should remove selected paths from manifest', async () => {
    writeManifest(projectDir, { 'my-agent': { file_patterns: ['*.ts', '*.tsx', '*.js'] } });
    mockSelect.mockResolvedValueOnce('remove' as never);
    mockMultiselect.mockResolvedValueOnce(['*.tsx'] as never);

    await runAgentPathsFor(projectDir, 'my-agent');

    const agents = readManifestAgents(projectDir);
    expect(agents['my-agent']!.file_patterns).toEqual(['*.ts', '*.js']);
    expect(vi.mocked(clack.log.success)).toHaveBeenCalled();
  });

  it('should show warning when trying to remove with no paths', async () => {
    writeManifest(projectDir, { 'my-agent': {} });
    mockSelect.mockResolvedValueOnce('remove' as never);

    await runAgentPathsFor(projectDir, 'my-agent');

    expect(vi.mocked(clack.log.warn)).toHaveBeenCalledWith(
      expect.stringContaining('No paths to remove'),
    );
  });
});
