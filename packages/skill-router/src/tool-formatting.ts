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
  toolName: ToolName,
  skillContents?: Map<string, string>
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

  // Check if we have any skill content to inject
  const hasContent = skillContents && skillContents.size > 0;

  if (hasContent) {
    // Inject skill bodies directly (aligned with UserPromptSubmit behavior)
    for (const result of matchedSkills) {
      const body = skillContents.get(result.skill.path);
      if (body) {
        lines.push('');
        lines.push('---');
        lines.push(body);
      }
    }

    lines.push('');
    lines.push(
      `Follow the skill instructions above for this ${toolName} operation.`
    );
  } else {
    // Fallback: ask Claude to read the files
    lines.push('');
    lines.push(
      `Please read the SKILL.md file(s) listed above using the Read tool before continuing with this ${toolName} operation.`
    );
  }

  return lines.join('\n');
}
