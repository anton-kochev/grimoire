/**
 * Main execution flow for the Router
 */

import type { ExtractedSignals, HookInput, HookOutput, PreToolUseInput, PreToolUseOutput } from './types.js';
import { normalizePrompt } from './normalize.js';
import { extractSignals } from './signals.js';
import { scoreSkill } from './scoring.js';
import { filterByThreshold, sortDescendingByScore } from './filtering.js';
import { formatContext } from './formatting.js';
import { formatToolUseContext } from './tool-formatting.js';
import { loadManifest } from './manifest.js';
import { readSkillBody } from './skill-content.js';
import { parseStdinInput, readStdin } from './input.js';
import { buildLogEntry, writeLog } from './logging.js';
import { buildHookOutput } from './output.js';
import { buildPreToolUseOutput } from './tool-output.js';
import { extractToolSignals } from './tool-input.js';
import { parseArgs } from './args.js';
import { runEnforce, runSubagentStart, runSubagentStop } from './enforce.js';

const DEFAULT_PRETOOLUSE_THRESHOLD = 1.5;

/**
 * Processes a prompt and returns hook output if skills match.
 *
 * @param input - Parsed hook input
 * @param manifestPath - Path to the skill manifest
 * @param projectDir - Optional project directory for SKILL.md content injection
 * @returns HookOutput if skills matched, null otherwise
 */
export function processPrompt(
  input: HookInput,
  manifestPath: string,
  projectDir?: string
): HookOutput | null {
  const startTime = Date.now();
  let logPath = '.claude/logs/grimoire-router.log';

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
      // Read SKILL.md content when projectDir is available
      let skillContents: Map<string, string> | undefined;
      if (projectDir) {
        skillContents = new Map();
        for (const result of matched) {
          const body = readSkillBody(result.skill.path, projectDir);
          if (body) {
            skillContents.set(result.skill.path, body);
          }
        }
      }

      const context = formatContext(matched, skillContents);
      return buildHookOutput(context);
    }

    return null;
  } catch (error) {
    // Log error but don't throw - never block user
    const errorMessage =
      error instanceof Error ? error.message : String(error);

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
 * Processes a PreToolUse hook event and returns output if skills match.
 *
 * @param input - Parsed PreToolUse input
 * @param manifestPath - Path to the skill manifest
 * @param projectDir - Project directory for path stripping
 * @returns PreToolUseOutput if skills matched, null otherwise
 */
export function processToolUse(
  input: PreToolUseInput,
  manifestPath: string,
  projectDir: string
): PreToolUseOutput | null {
  const startTime = Date.now();
  let logPath = '.claude/logs/grimoire-router.log';

  try {
    // Load manifest
    const manifest = loadManifest(manifestPath);
    logPath = manifest.config.log_path ?? logPath;

    // Extract signals from tool input (file path)
    const signals = extractToolSignals(input.tool_input, projectDir);

    // Score all skills — only file_extensions and file_paths are meaningful for
    // PreToolUse (keywords match path components, not user intent; patterns need
    // a prompt). Empty words disables keywords; empty string disables patterns.
    const fileOnlySignals: ExtractedSignals = {
      words: new Set(),
      extensions: signals.extensions,
      paths: signals.paths,
    };
    const results = manifest.skills.map((skill) =>
      scoreSkill(skill, fileOnlySignals, '', manifest.config.weights)
    );

    // Filter by pretooluse_threshold
    const threshold =
      manifest.config.pretooluse_threshold ?? DEFAULT_PRETOOLUSE_THRESHOLD;
    const matched = sortDescendingByScore(
      filterByThreshold(results, threshold)
    );

    // Determine outcome
    const outcome = matched.length > 0 ? 'activated' : 'no_match';

    // Build and write log entry
    const logEntry = buildLogEntry({
      sessionId: input.session_id,
      promptRaw: `[PreToolUse:${input.tool_name}] ${typeof input.tool_input['file_path'] === 'string' ? input.tool_input['file_path'] : ''}`,
      promptNormalized: '',
      signals: fileOnlySignals,
      skillsEvaluated: manifest.skills.length,
      matchedSkills: matched,
      threshold,
      startTime,
      outcome,
    });
    writeLog(
      { ...logEntry, hook_event: 'PreToolUse', tool_name: input.tool_name },
      logPath
    );

    // Return output if skills matched
    if (matched.length > 0) {
      // Read SKILL.md content for injection (same pattern as processPrompt)
      const skillContents = new Map<string, string>();
      for (const result of matched) {
        const body = readSkillBody(result.skill.path, projectDir);
        if (body) {
          skillContents.set(result.skill.path, body);
        }
      }

      const context = formatToolUseContext(
        matched,
        input.tool_name,
        skillContents
      );
      return buildPreToolUseOutput(context);
    }

    return null;
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);

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
    const args = parseArgs(process.argv);

    // Read stdin
    const stdinContent = readStdin();

    // Skip if empty
    if (!stdinContent.trim()) {
      process.exit(0);
    }

    // Dispatch enforce / subagent registry modes
    if (args.enforce || args.subagentStart || args.subagentStop) {
      let data: unknown;
      try {
        data = JSON.parse(stdinContent);
      } catch {
        process.exit(0);
      }

      const obj = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
      const sessionId = typeof obj['session_id'] === 'string' ? obj['session_id'] : 'unknown';

      if (args.enforce) {
        // Parse as PreToolUseInput for enforcement check
        const stdinInput = parseStdinInput(stdinContent);
        if (stdinInput.kind === 'tooluse') {
          const projectDir = process.env['CLAUDE_PROJECT_DIR'] ?? process.cwd();
          const manifestPath = `${projectDir}/.claude/skills-manifest.json`;
          let logPath = '.claude/logs/grimoire-router.log';
          try {
            const manifest = loadManifest(manifestPath);
            logPath = manifest.config.log_path ?? logPath;
          } catch { /* use default */ }
          runEnforce(stdinInput.input, logPath);
        }
        process.exit(0);
      }

      if (args.subagentStart) {
        runSubagentStart({ session_id: sessionId });
        // runSubagentStart calls process.exit internally
      }

      if (args.subagentStop) {
        runSubagentStop({ session_id: sessionId });
        // runSubagentStop calls process.exit internally
      }

      process.exit(0);
    }

    // Get manifest path from environment
    const projectDir = process.env['CLAUDE_PROJECT_DIR'] ?? process.cwd();
    const manifestPath = `${projectDir}/.claude/skills-manifest.json`;

    // Parse and dispatch based on input type
    const stdinInput = parseStdinInput(stdinContent);

    let output: HookOutput | PreToolUseOutput | null;

    if (stdinInput.kind === 'tooluse') {
      // PreToolUse hook
      output = processToolUse(stdinInput.input, manifestPath, projectDir);
    } else {
      // UserPromptSubmit mode
      output = processPrompt(stdinInput.input, manifestPath, projectDir);
    }

    // Write output if skills matched
    if (output) {
      process.stdout.write(JSON.stringify(output));
    }

    process.exit(0);
  } catch {
    // Always exit 0 — never block the user
    process.exit(0);
  }
}
