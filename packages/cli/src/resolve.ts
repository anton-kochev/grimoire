import { existsSync } from 'fs';
import { createRequire } from 'module';
import { dirname, join } from 'path';

/**
 * Resolves the directory path of an installed npm pack.
 *
 * @param packageName - npm package name (e.g., "@claudify/dotnet-pack")
 * @param cwd - Working directory to resolve from (defaults to process.cwd())
 * @returns Absolute path to the pack's root directory
 * @throws Error if the package cannot be found
 */
export function resolvePackDir(packageName: string, cwd?: string | undefined): string {
  const resolveFrom = cwd ?? process.cwd();
  const localRequire = createRequire(resolveFrom + '/noop.js');

  try {
    const packageJsonPath = localRequire.resolve(`${packageName}/package.json`);
    return dirname(packageJsonPath);
  } catch {
    // Fallback: try resolving the main entry and walking up
    try {
      const mainEntry = localRequire.resolve(packageName);
      return walkUpToPackageRoot(mainEntry);
    } catch {
      throw new Error(
        `Pack "${packageName}" not found. Is it installed? Try: npm install ${packageName}`,
      );
    }
  }
}

function walkUpToPackageRoot(filePath: string): string {
  let current = dirname(filePath);

  // Walk up until we find package.json or hit filesystem root
  for (;;) {
    if (existsSync(join(current, 'package.json'))) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }

  throw new Error(`Could not find package root for: ${filePath}`);
}
