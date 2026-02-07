/**
 * PreToolUse output formatting
 */

import type { SkillScoreResult, ToolName } from './types.js';
import { summarizeSignals } from './formatting.js';

/**
 * Formats matched skills into a concise context string for PreToolUse hooks.
 *
 * @param matchedSkills - Array of skill score results
 * @param toolName - The tool being used (Edit or Write)
 * @returns Formatted context string
 */
export function formatToolUseContext(
  matchedSkills: SkillScoreResult[],
  toolName: ToolName
): string {
  const lines: string[] = [];

  lines.push(
    `[Skill Router] Relevant skills for this ${toolName} operation:`
  );
  lines.push('');

  for (const result of matchedSkills) {
    const skillLine =
      `- ${result.skill.name} (${result.skill.path}/SKILL.md)` +
      ` -- score: ${result.score.toFixed(1)}`;
    lines.push(skillLine);

    const signalSummary = summarizeSignals(result.matchedSignals);
    if (signalSummary) {
      lines.push(`  Matched: ${signalSummary}`);
    }
  }

  lines.push('');
  lines.push(
    'Read the SKILL.md file(s) above if you have not already loaded them in this session.'
  );

  return lines.join('\n');
}
