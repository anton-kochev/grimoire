/**
 * Output formatting functions
 */

import type { MatchedSignal, SkillScoreResult } from './types.js';

/**
 * Summarizes matched signals into a human-readable string.
 *
 * Format: keywords[a, b], extensions[.pdf], patterns[2 matched], paths[invoices/]
 *
 * @param signals - Array of matched signals
 * @returns Formatted summary string
 */
export function summarizeSignals(signals: MatchedSignal[]): string {
  if (signals.length === 0) {
    return '';
  }

  // Group signals by type
  const groups: Record<string, string[]> = {};

  for (const signal of signals) {
    if (!groups[signal.type]) {
      groups[signal.type] = [];
    }
    groups[signal.type]!.push(signal.value);
  }

  const parts: string[] = [];

  // Keywords
  if (groups['keyword']) {
    parts.push(`keywords[${groups['keyword'].join(', ')}]`);
  }

  // Extensions
  if (groups['extension']) {
    parts.push(`extensions[${groups['extension'].join(', ')}]`);
  }

  // Patterns (show count, not values)
  if (groups['pattern']) {
    parts.push(`patterns[${groups['pattern'].length} matched]`);
  }

  // Paths
  if (groups['path']) {
    parts.push(`paths[${groups['path'].join(', ')}]`);
  }

  return parts.join(', ');
}

/**
 * Formats matched skills into context injection message.
 * When skill content is provided, injects the SKILL.md body directly.
 *
 * @param matchedSkills - Array of skill score results
 * @param skillContents - Optional map of skill path to SKILL.md body content
 * @returns Formatted context string for LLM injection
 */
export function formatContext(
  matchedSkills: SkillScoreResult[],
  skillContents?: Map<string, string>
): string {
  const lines: string[] = [];

  lines.push(
    '[Skill Router] The following skills are relevant to this request:'
  );
  lines.push('');

  for (const result of matchedSkills) {
    const skillLine =
      `• ${result.skill.name} (${result.skill.path}/SKILL.md)` +
      ` — score: ${result.score.toFixed(1)}`;
    lines.push(skillLine);

    // Add matched signals as sub-item
    const signalSummary = summarizeSignals(result.matchedSignals);
    if (signalSummary) {
      lines.push(`  Matched: ${signalSummary}`);
    }
  }

  // Inject skill content if available
  const injectedAny = skillContents != null && skillContents.size > 0 &&
    matchedSkills.some((r) => skillContents.has(r.skill.path));

  if (injectedAny) {
    for (const result of matchedSkills) {
      const content = skillContents!.get(result.skill.path);
      if (content) {
        lines.push('');
        lines.push('---');
        lines.push(`### ${result.skill.name} (${result.skill.path}/SKILL.md)`);
        lines.push('');
        lines.push(content);
      }
    }

    lines.push('');
    lines.push(
      'Follow the skill instructions above. Read referenced files within skills as needed.'
    );
  } else {
    lines.push('');
    lines.push(
      'Please read the SKILL.md file(s) listed above using the view tool before proceeding with the task.'
    );
  }

  return lines.join('\n');
}
