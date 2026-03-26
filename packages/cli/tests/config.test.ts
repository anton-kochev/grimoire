import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

vi.mock('@clack/prompts', () => ({
  intro: vi.fn(),
  outro: vi.fn(),
  cancel: vi.fn(),
  log: { warn: vi.fn(), error: vi.fn(), message: vi.fn(), info: vi.fn(), success: vi.fn() },
  select: vi.fn(),
  multiselect: vi.fn(),
  isCancel: vi.fn((v: unknown) => v === Symbol.for('clack.cancel')),
}));

import * as clack from '@clack/prompts';
import { runConfig } from '../src/commands/config.js';

const CANCEL = Symbol.for('clack.cancel');

function makeTmpDir(): string {
  const raw = join(tmpdir(), `grimoire-config-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(raw, { recursive: true });
  return realpathSync(raw);
}

function writeManifest(projectDir: string): void {
  const claudeDir = join(projectDir, '.claude');
  mkdirSync(claudeDir, { recursive: true });
  writeFileSync(
    join(claudeDir, 'skills-manifest.json'),
    JSON.stringify({ version: '1', config: {}, skills: [], agents: {} }),
  );
}

describe('runConfig', () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = makeTmpDir();
    writeManifest(projectDir);
    vi.clearAllMocks();
  });

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true });
  });

  it('should show intro and outro in normal mode', async () => {
    vi.mocked(clack.multiselect).mockResolvedValueOnce(CANCEL as never);

    await runConfig(projectDir);

    expect(vi.mocked(clack.intro)).toHaveBeenCalledWith('Grimoire configuration');
    expect(vi.mocked(clack.outro)).toHaveBeenCalled();
  });

  it('should skip intro and outro in quiet mode', async () => {
    vi.mocked(clack.multiselect).mockResolvedValueOnce(CANCEL as never);

    await runConfig(projectDir, { quiet: true });

    expect(vi.mocked(clack.intro)).not.toHaveBeenCalled();
    expect(vi.mocked(clack.outro)).not.toHaveBeenCalled();
  });
});
