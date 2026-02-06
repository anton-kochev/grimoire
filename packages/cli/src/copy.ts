import { cpSync, existsSync, mkdirSync, statSync } from 'fs';
import { basename, dirname, join, resolve } from 'path';
import type { InstallItem, InstallResult } from './types.js';

interface CopyResult {
  readonly destinationPath: string;
  readonly overwritten: boolean;
}

/**
 * Copies a single agent .md file from a pack into the project's .claude/agents/ directory.
 */
export function copyAgent(
  packDir: string,
  relativePath: string,
  projectDir: string,
): CopyResult {
  validateNoTraversal(packDir, relativePath);

  const sourcePath = join(packDir, relativePath);
  if (!existsSync(sourcePath)) {
    throw new Error(`Agent source not found: ${sourcePath}`);
  }

  const fileName = basename(relativePath);
  const destDir = join(projectDir, '.claude', 'agents');
  mkdirSync(destDir, { recursive: true });

  const destPath = join(destDir, fileName);
  const overwritten = existsSync(destPath);

  cpSync(sourcePath, destPath, { force: true });

  return { destinationPath: destPath, overwritten };
}

/**
 * Copies a skill directory recursively from a pack into the project's .claude/skills/ directory.
 */
export function copySkill(
  packDir: string,
  relativePath: string,
  projectDir: string,
): CopyResult {
  validateNoTraversal(packDir, relativePath);

  const sourcePath = join(packDir, relativePath);
  if (!existsSync(sourcePath)) {
    throw new Error(`Skill source not found: ${sourcePath}`);
  }

  const dirName = basename(relativePath);
  const destDir = join(projectDir, '.claude', 'skills');
  mkdirSync(destDir, { recursive: true });

  const destPath = join(destDir, dirName);
  const overwritten = existsSync(destPath);

  cpSync(sourcePath, destPath, { recursive: true, force: true });

  return { destinationPath: destPath, overwritten };
}

/**
 * Copies a list of install items (agents and skills) into the project directory.
 */
export function copyItems(
  items: readonly InstallItem[],
  packDir: string,
  projectDir: string,
): readonly InstallResult[] {
  return items.map((item) => {
    const copyResult =
      item.type === 'agent'
        ? copyAgent(packDir, item.sourcePath, projectDir)
        : copySkill(packDir, item.sourcePath, projectDir);

    return {
      item,
      destinationPath: copyResult.destinationPath,
      overwritten: copyResult.overwritten,
    };
  });
}

function validateNoTraversal(packDir: string, relativePath: string): void {
  const resolved = resolve(packDir, relativePath);
  if (!resolved.startsWith(resolve(packDir))) {
    throw new Error(`Path traversal detected: "${relativePath}" escapes pack root`);
  }
}
