import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resolvePackDir } from '../src/resolve.js';
import { mkdirSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('resolvePackDir', () => {
  let testDir: string;

  beforeEach(() => {
    const raw = join(tmpdir(), `claudify-resolve-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(raw, { recursive: true });
    testDir = realpathSync(raw);
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  it('should resolve pack via package.json path in node_modules', () => {
    // Create a fake node_modules/<pack>/package.json structure
    const packDir = join(testDir, 'node_modules', 'test-pack');
    mkdirSync(packDir, { recursive: true });
    writeFileSync(join(packDir, 'package.json'), JSON.stringify({ name: 'test-pack', version: '1.0.0' }));
    writeFileSync(join(packDir, 'claudify.json'), JSON.stringify({ name: 'test-pack', version: '1.0.0', agents: [], skills: [] }));

    const result = resolvePackDir('test-pack', testDir);

    expect(result).toBe(packDir);
  });

  it('should resolve scoped pack via node_modules', () => {
    const packDir = join(testDir, 'node_modules', '@claudify', 'dotnet-pack');
    mkdirSync(packDir, { recursive: true });
    writeFileSync(join(packDir, 'package.json'), JSON.stringify({ name: '@claudify/dotnet-pack', version: '1.0.0' }));
    writeFileSync(join(packDir, 'claudify.json'), JSON.stringify({ name: 'dotnet-pack', version: '1.0.0', agents: [], skills: [] }));

    const result = resolvePackDir('@claudify/dotnet-pack', testDir);

    expect(result).toBe(packDir);
  });

  it('should throw descriptive error when package not found', () => {
    expect(() => resolvePackDir('nonexistent-pack', testDir)).toThrow(/not found|cannot find/i);
  });

  it('should resolve using provided cwd', () => {
    const packDir = join(testDir, 'node_modules', 'my-pack');
    mkdirSync(packDir, { recursive: true });
    writeFileSync(join(packDir, 'package.json'), JSON.stringify({ name: 'my-pack', version: '1.0.0' }));

    const result = resolvePackDir('my-pack', testDir);

    expect(result).toBe(packDir);
  });
});
