/**
 * Main execution flow for the Skill Router
 */

import type { HookInput, HookOutput } from './types.js';
import { normalizePrompt } from './normalize.js';
import { extractSignals } from './signals.js';
import { scoreSkill } from './scoring.js';
import { filterByThreshold, sortDescendingByScore } from './filtering.js';
import { formatContext } from './formatting.js';
import { loadManifest } from './manifest.js';
import { parseHookInput, readStdin } from './input.js';
import { buildLogEntry, writeLog } from './logging.js';
import { buildHookOutput } from './output.js';

/**
 * Processes a prompt and returns hook output if skills match.
 *
 * @param input - Parsed hook input
 * @param manifestPath - Path to the skill manifest
 * @returns HookOutput if skills matched, null otherwise
 */
export function processPrompt(
  input: HookInput,
  manifestPath: string
): HookOutput | null {
  const startTime = Date.now();
  let logPath = '.claude/logs/skill-router.log';

  try {
    // Skip empty/whitespace prompts
    if (!input.prompt.trim()) {
      return null;
    }

    // Load manifest
    const manifest = loadManifest(manifestPath);
    logPath = manifest.config.log_path ?? logPath;

    // Normalize prompt
    const normalized = normalizePrompt(input.prompt);
    if (!normalized) {
      return null;
    }

    // Extract signals
    const signals = extractSignals(normalized);

    // Score all skills
    const results = manifest.skills.map((skill) =>
      scoreSkill(skill, signals, normalized, manifest.config.weights)
    );

    // Filter and sort
    const matched = sortDescendingByScore(
      filterByThreshold(results, manifest.config.activation_threshold)
    );

    // Determine outcome
    const outcome = matched.length > 0 ? 'activated' : 'no_match';

    // Build and write log entry
    const logEntry = buildLogEntry({
      sessionId: input.session_id,
      promptRaw: input.prompt,
      promptNormalized: normalized,
      signals,
      skillsEvaluated: manifest.skills.length,
      matchedSkills: matched,
      threshold: manifest.config.activation_threshold,
      startTime,
      outcome,
    });
    writeLog(logEntry, logPath);

    // Return output if skills matched
    if (matched.length > 0) {
      const context = formatContext(matched);
      return buildHookOutput(context);
    }

    return null;
  } catch (error) {
    // Log error but don't throw - never block user
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    console.error(`[Skill Router Error] ${errorMessage}`);

    // Try to write error log
    try {
      writeLog(
        {
          timestamp: new Date().toISOString(),
          level: 'error',
          message: errorMessage,
          error_type: error instanceof Error ? error.name : 'Unknown',
          stack_trace: error instanceof Error ? error.stack : null,
        },
        logPath
      );
    } catch {
      // Ignore logging errors
    }

    return null;
  }
}

/**
 * Main entry point - reads from stdin, processes, writes to stdout.
 */
export async function main(): Promise<void> {
  try {
    // Read stdin
    const stdinContent = readStdin();

    // Skip if empty
    if (!stdinContent.trim()) {
      process.exit(0);
    }

    // Parse input
    const input = parseHookInput(stdinContent);

    // Get manifest path from environment
    const projectDir = process.env['CLAUDE_PROJECT_DIR'] ?? process.cwd();
    const manifestPath = `${projectDir}/.claude/skills-manifest.json`;

    // Process
    const output = processPrompt(input, manifestPath);

    // Write output if skills matched
    if (output) {
      process.stdout.write(JSON.stringify(output));
    }

    process.exit(0);
  } catch (error) {
    // Log error but always exit 0
    console.error(
      `[Skill Router Error] ${error instanceof Error ? error.message : String(error)}`
    );
    process.exit(0);
  }
}
