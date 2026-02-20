import { readFileSync } from 'fs';

/** Reads `version` from YAML frontmatter. Returns undefined if absent/unreadable. */
export function readFrontmatterVersion(filePath: string): string | undefined {
  let content: string;
  try {
    content = readFileSync(filePath, 'utf-8');
  } catch {
    return undefined;
  }
  const fm = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fm) return undefined;
  const m = fm[1]?.match(/^version:\s*(.+)$/m);
  return m?.[1]?.trim();
}

/** Returns true if `available` semver is strictly newer than `installed`. */
export function isNewer(available: string | undefined, installed: string | undefined): boolean {
  if (!available || !installed) return false;
  const parse = (v: string) => v.split('.').map((n) => parseInt(n, 10));
  const [a, b] = [parse(available), parse(installed)];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff > 0) return true;
    if (diff < 0) return false;
  }
  return false;
}
