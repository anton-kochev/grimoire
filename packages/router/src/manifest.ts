/**
 * Manifest loading and validation
 */

import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { SkillManifest, SkillDefinition, AgentEntry } from './types.js';

const DEFAULT_LOG_PATH = '.claude/logs/grimoire-router.log';

/**
 * Loads and validates the skill manifest from `.claude/grimoire.json` (router key).
 *
 * Migration: if grimoire.json has no `router` key but `.claude/skills-manifest.json`
 * exists, the manifest is merged into grimoire.json and the old file is deleted.
 *
 * @param projectDir - Absolute path to the project root
 * @returns Validated SkillManifest
 * @throws Error if config not found, invalid JSON, or schema validation fails
 */
export function loadManifest(projectDir: string): SkillManifest {
  const grimoirePath = join(projectDir, '.claude', 'grimoire.json');
  const legacyPath = join(projectDir, '.claude', 'skills-manifest.json');

  // Read grimoire.json (may or may not exist)
  let grimoireData: Record<string, unknown> | null = null;
  if (existsSync(grimoirePath)) {
    let content: string;
    try {
      content = readFileSync(grimoirePath, 'utf-8');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Config file not found: ${grimoirePath} - ${message}`);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to parse manifest JSON: ${message}`);
    }

    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      grimoireData = parsed as Record<string, unknown>;
    }
  }

  // If grimoire.json has a router key, use it directly
  if (grimoireData && grimoireData['router'] && typeof grimoireData['router'] === 'object') {
    return validateManifest(grimoireData['router'] as Record<string, unknown>);
  }

  // Migration: try legacy skills-manifest.json
  if (existsSync(legacyPath)) {
    let legacyContent: string;
    try {
      legacyContent = readFileSync(legacyPath, 'utf-8');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Legacy manifest not found: ${legacyPath} - ${message}`);
    }

    let legacyData: unknown;
    try {
      legacyData = JSON.parse(legacyContent);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to parse manifest JSON: ${message}`);
    }

    // Merge into grimoire.json under router key
    const merged = { ...(grimoireData ?? {}), router: legacyData };
    writeFileSync(grimoirePath, JSON.stringify(merged, null, 2) + '\n');
    unlinkSync(legacyPath);

    return validateManifest(legacyData as Record<string, unknown>);
  }

  // Neither source available
  if (grimoireData) {
    throw new Error('grimoire.json has no router configuration');
  }
  throw new Error(`Config file not found: ${grimoirePath}`);
}

/**
 * Validates and normalizes a raw manifest object into a SkillManifest.
 */
function validateManifest(data: Record<string, unknown>): SkillManifest {
  const manifest = data;

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
 * Parses the optional agents section of the manifest.
 */
function parseAgentsSection(
  agents: unknown
): Record<string, AgentEntry> | undefined {
  if (agents === undefined || agents === null) {
    return undefined;
  }

  if (typeof agents !== 'object' || Array.isArray(agents)) {
    throw new Error('Manifest agents must be an object');
  }

  const agentsMap = agents as Record<string, unknown>;
  const result: Record<string, AgentEntry> = {};

  for (const [agentName, agentConfig] of Object.entries(agentsMap)) {
    if (!agentConfig || typeof agentConfig !== 'object') {
      throw new Error(`Agent "${agentName}" config must be an object`);
    }

    const cfg = agentConfig as Record<string, unknown>;
    const entry: AgentEntry = {};

    if (cfg['file_patterns'] !== undefined) {
      if (!Array.isArray(cfg['file_patterns'])) {
        throw new Error(`Agent "${agentName}" file_patterns must be an array`);
      }
      entry.file_patterns = cfg['file_patterns'] as string[];
    }

    result[agentName] = entry;
  }

  return result;
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
