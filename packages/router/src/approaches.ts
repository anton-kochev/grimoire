/**
 * Enforced approaches: binding directives attached to agents in
 * `.claude/grimoire.json` (`router.agents.<name>.approaches`). The router
 * injects a mandate at SubagentStart and, for skill-backed approaches,
 * verifies at SubagentStop that the bound skill was invoked — bouncing a
 * non-compliant editing run back exactly once.
 */

import type { ApproachEntry } from './types.js';
import { parseApproachEntry } from './manifest.js';
import { loadGrimoireConfig } from './grimoire-config.js';
import { extractActivatedSkills, transcriptHasEdits } from './archive.js';

/**
 * Marks bounce feedback in the transcript; its presence caps the adherence
 * check at one bounce per run (stateless loop protection). Must never appear
 * in the mandate text, or the check would self-disable on every run.
 */
export const APPROACH_CHECK_MARKER = '[grimoire:approach-check]';

/**
 * Reads the enforced approaches configured for an agent. Fail-soft: returns
 * `[]` on missing config, missing router/agents keys, unknown agent, or
 * malformed entries — hooks must never throw over configuration.
 */
export function loadAgentApproaches(configDir: string, agentType: string): ApproachEntry[] {
  try {
    const raw = loadGrimoireConfig(configDir).router?.agents?.[agentType]?.approaches;
    if (!Array.isArray(raw)) return [];
    return (raw as unknown[])
      .map(parseApproachEntry)
      .filter((a): a is ApproachEntry => a !== null);
  } catch {
    return [];
  }
}

/**
 * Builds the mandate injected as SubagentStart additionalContext — the
 * agent sees it before its first prompt.
 */
export function buildApproachMandate(
  agentType: string,
  approaches: readonly ApproachEntry[],
): string {
  const blocks = approaches.map((approach, i) => {
    const lines = [`### ${i + 1}. ${approach.name}`, `Directive: ${approach.directive}`];
    if (approach.skill) {
      lines.push(
        'Required skill: As your FIRST action, before any other tool use, invoke the Skill tool',
        `with skill "${approach.skill}", then adhere to it for the rest of the run.`,
      );
    }
    return lines.join('\n');
  });

  const parts = [
    '## Grimoire: enforced approaches',
    '',
    `You are running as "${agentType}". The approaches below are binding directives for this`,
    'entire run. They are requirements, not suggestions; they govern HOW you work, while the',
    'task prompt governs WHAT you build.',
    '',
    blocks.join('\n\n'),
  ];

  if (approaches.some((a) => a.skill)) {
    parts.push(
      '',
      'Compliance is checked when you finish. A run that edited files without having invoked',
      'each required skill is returned for rework before its result is accepted.',
    );
  }

  return parts.join('\n');
}

/**
 * Builds the bounce feedback injected as SubagentStop additionalContext —
 * the run continues so the agent can act on it.
 */
export function buildApproachFeedback(violated: readonly ApproachEntry[]): string {
  const bullets = violated.map(
    (v) => `- Approach "${v.name}" requires the skill "${v.skill}"`,
  );
  const invokeStep =
    violated.length === 1
      ? `1. Invoke the Skill tool with skill "${violated[0]!.skill}" and read it.`
      : '1. Invoke the Skill tool for each skill listed above and read them.';

  return [
    `${APPROACH_CHECK_MARKER} Approach compliance check: FAILED.`,
    '',
    'This run made file edits but never invoked the skill required by its enforced approach(es):',
    ...bullets,
    '',
    'Do ALL of the following now, before finishing:',
    invokeStep,
    "2. Review every edit you made in this run against that skill's methodology.",
    '3. Fix any violations you find.',
    '4. Then finish, summarizing what you re-checked or changed.',
  ].join('\n');
}

/**
 * Result of the SubagentStop adherence check. `violated` is non-empty only
 * when the outcome is `bounced`.
 */
export interface ApproachCheckResult {
  outcome: 'passed' | 'bounced' | 'skipped';
  violated: ApproachEntry[];
}

/**
 * Decides whether a finished run honored its skill-backed approaches.
 * Decision order matters:
 *   1. nothing skill-backed → skipped (nothing verifiable)
 *   2. cancelled/error stop → skipped (don't pile onto a failed run)
 *   3. no transcript → skipped (fail open; hooks never wedge)
 *   4. every bound skill invoked → passed (even after a prior bounce)
 *   5. marker already present → skipped (at most one bounce per run)
 *   6. no edits made → skipped (read-only runs have nothing to enforce)
 *   7. otherwise → bounced with the missing approaches
 */
export function evaluateApproachCheck(
  approaches: readonly ApproachEntry[],
  transcriptText: string | null,
  stopReason?: string,
): ApproachCheckResult {
  const skipped: ApproachCheckResult = { outcome: 'skipped', violated: [] };

  const skillBacked = approaches.filter((a) => a.skill);
  if (skillBacked.length === 0) return skipped;
  if (stopReason === 'cancelled' || stopReason === 'error') return skipped;
  if (transcriptText === null) return skipped;

  const activated = new Set(extractActivatedSkills(transcriptText));
  const missing = skillBacked.filter((a) => !activated.has(a.skill!));
  if (missing.length === 0) return { outcome: 'passed', violated: [] };

  if (transcriptText.includes(APPROACH_CHECK_MARKER)) return skipped;
  if (!transcriptHasEdits(transcriptText)) return skipped;

  return { outcome: 'bounced', violated: missing };
}
