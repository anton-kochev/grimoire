import { readFileSync } from 'fs';
import { join } from 'path';
import type { PackManifest, PackAgentEntry, PackSkillEntry, PackSkillTriggers } from './types.js';

/**
 * Loads and validates a grimoire pack manifest from a directory.
 *
 * @param packDir - Absolute path to the pack's root directory
 * @returns Validated PackManifest
 * @throws Error if file not found, invalid JSON, or schema validation fails
 */
export function loadManifest(packDir: string): PackManifest {
  const manifestPath = join(packDir, 'grimoire.json');

  let content: string;
  try {
    content = readFileSync(manifestPath, 'utf-8');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Manifest file not found: ${manifestPath} - ${message}`);
  }

  let data: unknown;
  try {
    data = JSON.parse(content);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse manifest JSON: ${message}`);
  }

  if (!data || typeof data !== 'object') {
    throw new Error('Manifest must be an object');
  }

  const raw = data as Record<string, unknown>;

  if (!raw['name'] || typeof raw['name'] !== 'string') {
    throw new Error('Manifest must have a "name" string field');
  }

  if (!raw['version'] || typeof raw['version'] !== 'string') {
    throw new Error('Manifest must have a "version" string field');
  }

  if (!Array.isArray(raw['agents'])) {
    throw new Error('Manifest must have an "agents" array field');
  }

  if (!Array.isArray(raw['skills'])) {
    throw new Error('Manifest must have a "skills" array field');
  }

  const agents = (raw['agents'] as unknown[]).map((entry, i) =>
    validateAgentEntry(entry, i),
  );

  const skills = (raw['skills'] as unknown[]).map((entry, i) =>
    validateSkillEntry(entry, i),
  );

  return {
    name: raw['name'] as string,
    version: raw['version'] as string,
    agents,
    skills,
  };
}

function validateAgentEntry(entry: unknown, index: number): PackAgentEntry {
  if (!entry || typeof entry !== 'object') {
    throw new Error(`Agent entry [${index}] must be an object`);
  }

  const raw = entry as Record<string, unknown>;

  if (!raw['name'] || typeof raw['name'] !== 'string') {
    throw new Error(`Agent entry [${index}] must have a "name" string field`);
  }

  if (!raw['path'] || typeof raw['path'] !== 'string') {
    throw new Error(`Agent entry [${index}] must have a "path" string field`);
  }

  if (!raw['description'] || typeof raw['description'] !== 'string') {
    throw new Error(`Agent entry [${index}] must have a "description" string field`);
  }

  const agentVersion = typeof raw['version'] === 'string' ? raw['version'] : undefined;
  return {
    name: raw['name'] as string,
    path: raw['path'] as string,
    description: raw['description'] as string,
    ...(agentVersion !== undefined && { version: agentVersion }),
  };
}

function validateSkillEntry(entry: unknown, index: number): PackSkillEntry {
  if (!entry || typeof entry !== 'object') {
    throw new Error(`Skill entry [${index}] must be an object`);
  }

  const raw = entry as Record<string, unknown>;

  if (!raw['name'] || typeof raw['name'] !== 'string') {
    throw new Error(`Skill entry [${index}] must have a "name" string field`);
  }

  if (!raw['path'] || typeof raw['path'] !== 'string') {
    throw new Error(`Skill entry [${index}] must have a "path" string field`);
  }

  if (!raw['description'] || typeof raw['description'] !== 'string') {
    throw new Error(`Skill entry [${index}] must have a "description" string field`);
  }

  const triggers = raw['triggers'] != null
    ? validateTriggers(raw['triggers'], index)
    : undefined;

  const skillVersion = typeof raw['version'] === 'string' ? raw['version'] : undefined;
  return {
    name: raw['name'] as string,
    path: raw['path'] as string,
    description: raw['description'] as string,
    ...(triggers !== undefined && { triggers }),
    ...(skillVersion !== undefined && { version: skillVersion }),
  };
}

function validateTriggers(triggers: unknown, skillIndex: number): PackSkillTriggers {
  if (typeof triggers !== 'object' || triggers === null) {
    throw new Error(`Skill entry [${skillIndex}] triggers must be an object`);
  }

  const raw = triggers as Record<string, unknown>;

  return {
    keywords: asStringArray(raw['keywords']),
    file_extensions: asStringArray(raw['file_extensions']),
    patterns: asStringArray(raw['patterns']),
    file_paths: asStringArray(raw['file_paths']),
  };
}

function asStringArray(value: unknown): readonly string[] {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    return [];
  }
  return value as string[];
}
