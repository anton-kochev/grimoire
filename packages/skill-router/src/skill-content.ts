/**
 * SKILL.md content reading utility
 */

import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Reads a SKILL.md file and returns its body content (without YAML frontmatter).
 *
 * @param skillPath - Relative path to the skill directory (e.g., '.claude/skills/my-skill')
 * @param projectDir - Absolute path to the project root
 * @returns Body content trimmed, or null if file not found, empty, or read error
 */
export function readSkillBody(
  skillPath: string,
  projectDir: string
): string | null {
  try {
    const filePath = join(projectDir, skillPath, 'SKILL.md');
    const content = readFileSync(filePath, 'utf-8');

    // Strip YAML frontmatter if present
    if (content.startsWith('---\n')) {
      const closingIndex = content.indexOf('\n---', 4);
      if (closingIndex !== -1) {
        const body = content.slice(closingIndex + 4).trim();
        return body || null;
      }
    }

    // No frontmatter — return full content if non-empty
    const trimmed = content.trim();
    return trimmed || null;
  } catch {
    return null;
  }
}
