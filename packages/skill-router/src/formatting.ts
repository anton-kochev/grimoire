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
    groups[signal.type].push(signal.value);
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
 *
 * @param matchedSkills - Array of skill score results
 * @returns Formatted context string for LLM injection
 */
export function formatContext(matchedSkills: SkillScoreResult[]): string {
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

  lines.push('');
  lines.push(
    'Please read the SKILL.md file(s) listed above using the view tool before proceeding with the task.'
  );

  return lines.join('\n');
}

/**
 * Formats activation instructions for an agent with required and recommended skills.
 *
 * @param alwaysSkills - Skills the agent MUST activate (mandatory)
 * @param matchedSkills - Skills matched from compatible_skills based on task content
 * @returns Formatted context string for agent injection
 */
export function formatAgentContext(
  alwaysSkills: string[],
  matchedSkills: SkillScoreResult[]
): string {
  const lines: string[] = [];

  // Required skills section
  if (alwaysSkills.length > 0) {
    lines.push('## Skill Activation Required');
    lines.push('');
    lines.push(
      'You MUST activate the following skills before starting work:'
    );
    for (const skill of alwaysSkills) {
      lines.push(`- ${skill}`);
    }
    lines.push('');
    lines.push('Use the Skill tool to load each required skill.');
  }

  // Recommended skills section
  if (matchedSkills.length > 0) {
    if (lines.length > 0) {
      lines.push('');
    }
    lines.push('## Recommended Skills');
    lines.push('');
    lines.push('Based on your task, these skills may be helpful:');
    for (const result of matchedSkills) {
      const signalSummary = summarizeSignals(result.matchedSignals);
      const matchInfo = signalSummary ? ` (matched: ${signalSummary})` : '';
      lines.push(`- ${result.skill.name}${matchInfo}`);
    }
    lines.push('');
    lines.push('Activate recommended skills if relevant to your work.');
  }

  return lines.join('\n');
}
