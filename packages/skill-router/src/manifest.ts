/**
 * Manifest loading and validation
 */

import { readFileSync } from 'fs';
import type {
  SkillManifest,
  SkillDefinition,
  AgentsMap,
  AgentConfig,
} from './types.js';

const DEFAULT_LOG_PATH = '.claude/logs/skill-router.log';

/**
 * Loads and validates a skill manifest from the filesystem.
 *
 * @param manifestPath - Absolute path to the manifest JSON file
 * @returns Validated SkillManifest
 * @throws Error if file not found, invalid JSON, or schema validation fails
 */
export function loadManifest(manifestPath: string): SkillManifest {
  // Read file
  let content: string;
  try {
    content = readFileSync(manifestPath, 'utf-8');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Manifest file not found: ${manifestPath} - ${message}`);
  }

  // Parse JSON
  let data: unknown;
  try {
    data = JSON.parse(content);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse manifest JSON: ${message}`);
  }

  // Validate structure
  if (!data || typeof data !== 'object') {
    throw new Error('Manifest must be an object');
  }

  const manifest = data as Record<string, unknown>;

  // Validate version
  if (!manifest['version'] || typeof manifest['version'] !== 'string') {
    throw new Error('Manifest must have a version field');
  }

  // Validate config
  if (!manifest['config'] || typeof manifest['config'] !== 'object') {
    throw new Error('Manifest must have a config object');
  }

  const config = manifest['config'] as Record<string, unknown>;

  // Validate weights
  if (!config['weights'] || typeof config['weights'] !== 'object') {
    throw new Error('Manifest config must have weights object');
  }

  // Validate activation_threshold
  if (typeof config['activation_threshold'] !== 'number') {
    throw new Error('Manifest config must have activation_threshold number');
  }

  // Validate skills array
  if (!Array.isArray(manifest['skills'])) {
    throw new Error('Manifest must have skills array');
  }

  // Apply defaults and normalize skills
  const skills: SkillDefinition[] = (manifest['skills'] as unknown[]).map(
    (skill) => normalizeSkill(skill as Record<string, unknown>)
  );

  // Parse optional agents section
  const agents = parseAgentsSection(manifest['agents']);

  return {
    version: manifest['version'] as string,
    config: {
      weights: config['weights'] as SkillManifest['config']['weights'],
      activation_threshold: config['activation_threshold'] as number,
      pretooluse_threshold:
        typeof config['pretooluse_threshold'] === 'number'
          ? config['pretooluse_threshold']
          : undefined,
      log_path: (config['log_path'] as string) || DEFAULT_LOG_PATH,
    },
    skills,
    agents,
  };
}

/**
 * Parses and validates the optional agents section of the manifest.
 */
function parseAgentsSection(
  agents: unknown
): AgentsMap | undefined {
  if (agents === undefined || agents === null) {
    return undefined;
  }

  if (typeof agents !== 'object' || Array.isArray(agents)) {
    throw new Error('Manifest agents must be an object');
  }

  const agentsMap = agents as Record<string, unknown>;
  const result: AgentsMap = {};

  for (const [agentName, agentConfig] of Object.entries(agentsMap)) {
    if (!agentConfig || typeof agentConfig !== 'object') {
      throw new Error(`Agent "${agentName}" config must be an object`);
    }

    const config = agentConfig as Record<string, unknown>;

    // Validate always_skills
    if (config['always_skills'] !== undefined) {
      if (!Array.isArray(config['always_skills'])) {
        throw new Error(`Agent "${agentName}" always_skills must be an array`);
      }
    }

    // Validate compatible_skills
    if (config['compatible_skills'] !== undefined) {
      if (!Array.isArray(config['compatible_skills'])) {
        throw new Error(
          `Agent "${agentName}" compatible_skills must be an array`
        );
      }
    }

    result[agentName] = {
      always_skills: (config['always_skills'] as string[]) || [],
      compatible_skills: (config['compatible_skills'] as string[]) || [],
    };
  }

  return result;
}

/**
 * Retrieves configuration for a specific agent from the manifest.
 *
 * @param manifest - The loaded skill manifest
 * @param agentName - Name of the agent to look up
 * @returns AgentConfig if found, undefined otherwise
 */
export function getAgentConfig(
  manifest: SkillManifest,
  agentName: string
): AgentConfig | undefined {
  return manifest.agents?.[agentName];
}

/**
 * Normalizes a skill definition, applying defaults for missing fields.
 */
function normalizeSkill(skill: Record<string, unknown>): SkillDefinition {
  const triggers = (skill['triggers'] as Record<string, unknown>) || {};

  return {
    path: skill['path'] as string,
    name: skill['name'] as string,
    description: skill['description'] as string | undefined,
    triggers: {
      keywords: (triggers['keywords'] as string[]) || [],
      file_extensions: (triggers['file_extensions'] as string[]) || [],
      patterns: (triggers['patterns'] as string[]) || [],
      file_paths: (triggers['file_paths'] as string[]) || [],
    },
  };
}
