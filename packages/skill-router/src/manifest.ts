/**
 * Manifest loading and validation
 */

import { readFileSync } from 'fs';
import type { SkillManifest, SkillDefinition } from './types.js';

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

  return {
    version: manifest['version'] as string,
    config: {
      weights: config['weights'] as SkillManifest['config']['weights'],
      activation_threshold: config['activation_threshold'] as number,
      log_path: (config['log_path'] as string) || DEFAULT_LOG_PATH,
    },
    skills,
  };
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
