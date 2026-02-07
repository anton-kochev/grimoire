/**
 * Main execution flow for the Skill Router
 */

import type { HookInput, HookOutput, PreToolUseInput, PreToolUseOutput } from './types.js';
import { normalizePrompt } from './normalize.js';
import { extractSignals } from './signals.js';
import { scoreSkill } from './scoring.js';
import { filterByThreshold, sortDescendingByScore } from './filtering.js';
import { formatContext, formatAgentContext } from './formatting.js';
import { formatToolUseContext } from './tool-formatting.js';
import { loadManifest, getAgentConfig } from './manifest.js';
import { parseStdinInput, readStdin } from './input.js';
import { buildLogEntry, writeLog } from './logging.js';
import { buildHookOutput } from './output.js';
import { buildPreToolUseOutput } from './tool-output.js';
import { extractToolSignals } from './tool-input.js';
import { parseArgs } from './args.js';

const DEFAULT_PRETOOLUSE_THRESHOLD = 1.5;

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
 * Processes a prompt for an agent (SubagentStart hook).
 * Filters skills based on agent's always_skills and compatible_skills.
 *
 * @param input - Parsed hook input
 * @param manifestPath - Path to the skill manifest
 * @param agentName - Name of the agent to configure
 * @returns HookOutput if agent has skills, null otherwise
 */
export function processAgentPrompt(
  input: HookInput,
  manifestPath: string,
  agentName: string
): HookOutput | null {
  const startTime = Date.now();
  let logPath = '.claude/logs/skill-router.log';

  try {
    // Load manifest
    const manifest = loadManifest(manifestPath);
    logPath = manifest.config.log_path ?? logPath;

    // Get agent config
    const agentConfig = getAgentConfig(manifest, agentName);
    if (!agentConfig) {
      // Unknown agent, don't block
      return null;
    }

    // Get always_skills (mandatory)
    const alwaysSkills = agentConfig.always_skills;

    // Score compatible skills against task prompt
    const normalized = normalizePrompt(input.prompt);
    let matchedSkills: ReturnType<typeof scoreSkill>[] = [];

    if (normalized && agentConfig.compatible_skills.length > 0) {
      const signals = extractSignals(normalized);

      // Filter to only compatible skills
      const compatibleSkillDefs = manifest.skills.filter((s) =>
        agentConfig.compatible_skills.includes(s.name)
      );

      // Score compatible skills
      const scored = compatibleSkillDefs.map((s) =>
        scoreSkill(s, signals, normalized, manifest.config.weights)
      );

      matchedSkills = sortDescendingByScore(
        filterByThreshold(scored, manifest.config.activation_threshold)
      );
    }

    // Build output if we have any skills to inject
    if (alwaysSkills.length > 0 || matchedSkills.length > 0) {
      const context = formatAgentContext(alwaysSkills, matchedSkills);

      // Log the agent mode processing
      const logEntry = buildLogEntry({
        sessionId: input.session_id,
        promptRaw: input.prompt,
        promptNormalized: normalized || '',
        signals: normalized ? extractSignals(normalized) : { words: new Set(), extensions: new Set(), paths: [] },
        skillsEvaluated: manifest.skills.length,
        matchedSkills,
        threshold: manifest.config.activation_threshold,
        startTime,
        outcome: 'activated',
      });
      writeLog(
        { ...logEntry, agent_mode: true, agent_name: agentName } as typeof logEntry & { agent_mode: boolean; agent_name: string },
        logPath
      );

      return buildHookOutput(context, 'SubagentStart');
    }

    return null;
  } catch (error) {
    // Log error but don't throw - never block agent
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    console.error(`[Skill Router Error] ${errorMessage}`);

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
  let logPath = '.claude/logs/skill-router.log';

  try {
    // Load manifest
    const manifest = loadManifest(manifestPath);
    logPath = manifest.config.log_path ?? logPath;

    // Extract signals from tool input (file path)
    const signals = extractToolSignals(input.tool_input, projectDir);

    // Score all skills (pass empty string as normalizedPrompt — no pattern matching)
    const results = manifest.skills.map((skill) =>
      scoreSkill(skill, signals, '', manifest.config.weights)
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
      signals,
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
      const context = formatToolUseContext(matched, input.tool_name);
      return buildPreToolUseOutput(context);
    }

    return null;
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    console.error(`[Skill Router Error] ${errorMessage}`);

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
    // Parse CLI arguments
    const args = parseArgs(process.argv);

    // Read stdin
    const stdinContent = readStdin();

    // Skip if empty
    if (!stdinContent.trim()) {
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
    } else if (args.agent) {
      // Agent mode: SubagentStart hook
      output = processAgentPrompt(stdinInput.input, manifestPath, args.agent);
    } else {
      // Original UserPromptSubmit mode
      output = processPrompt(stdinInput.input, manifestPath);
    }

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
