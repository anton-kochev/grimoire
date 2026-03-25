/**
 * Utilities for reading and writing the `skills:` array in agent YAML frontmatter.
 * Pure string functions — no file I/O.
 */

/**
 * Extracts the `skills:` array from YAML frontmatter in an agent .md file.
 * Returns skill names as a trimmed string array, or `[]` if absent.
 * SYNC: identical logic in packages/router/src/enforce.ts — keep in sync.
 */
export function parseAgentSkills(content: string): string[] {
  const fm = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fm?.[1]) return [];

  const lines = fm[1].split('\n');
  const skillsIdx = lines.findIndex((l) => /^skills:\s*$/.test(l));
  if (skillsIdx === -1) return [];

  const skills: string[] = [];
  for (let i = skillsIdx + 1; i < lines.length; i++) {
    const match = lines[i]!.match(/^\s+-\s+(.+)$/);
    if (!match) break;
    const name = match[1]!.trim();
    if (name) skills.push(name);
  }
  return skills;
}

/**
 * Adds, replaces, or removes the `skills:` block in agent YAML frontmatter.
 * Returns the updated file content with everything else preserved.
 */
export function updateAgentSkills(content: string, skills: string[]): string {
  const fmMatch = content.match(/^(---\r?\n)([\s\S]*?\r?\n)(---)/);
  if (!fmMatch) return content;

  const opening = fmMatch[1]!;
  const block = fmMatch[2]!;
  const closing = fmMatch[3]!;
  const afterFm = content.slice(fmMatch[0].length);

  const lines = block.split('\n');

  // Find existing skills: block boundaries
  const skillsIdx = lines.findIndex((l) => /^skills:\s*$/.test(l));

  let newBlock: string;
  if (skillsIdx === -1) {
    // No skills: key — insert before end
    if (skills.length === 0) return content;
    const skillLines = ['skills:', ...skills.map((s) => `  - ${s}`)];
    // Insert at end of frontmatter lines (last line is empty string from trailing \n)
    const insertAt = lines.length > 0 && lines[lines.length - 1] === '' ? lines.length - 1 : lines.length;
    lines.splice(insertAt, 0, ...skillLines);
    newBlock = lines.join('\n');
  } else {
    // Find end of the skills list items
    let endIdx = skillsIdx + 1;
    while (endIdx < lines.length && /^\s+-\s+/.test(lines[endIdx]!)) {
      endIdx++;
    }

    if (skills.length === 0) {
      // Remove entire skills: block
      lines.splice(skillsIdx, endIdx - skillsIdx);
    } else {
      // Replace skills items
      const skillLines = ['skills:', ...skills.map((s) => `  - ${s}`)];
      lines.splice(skillsIdx, endIdx - skillsIdx, ...skillLines);
    }
    newBlock = lines.join('\n');
  }

  return opening + newBlock + closing + afterFm;
}
