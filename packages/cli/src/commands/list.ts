import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { basename, join } from 'path';
import * as clack from '@clack/prompts';
import { readManifest } from '../enforce.js';
import { parseAgentSkills } from '../frontmatter.js';
import { removeSingleItem } from '../remove.js';
import { checkUpdates, type UpdateCheckResult } from './update.js';
import { copyItems } from '../copy.js';
import { runConfig } from './config.js';
import { runAgentSkillsFor } from './agent-skills.js';
import { readGrimoireConfig } from '../grimoire-config.js';
import { ensureEnforceHooks } from '../enforce.js';
import type { InstallItem } from '../types.js';

// --- Frontmatter helpers ---

interface AgentFullMeta {
  readonly description: string;
  readonly model: string;
  readonly tools: string;
}

function readAgentFullMeta(agentPath: string): AgentFullMeta {
  let content: string;
  try {
    content = readFileSync(agentPath, 'utf-8');
  } catch {
    return { description: '', model: '', tools: '' };
  }
  const fm = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fm?.[1]) return { description: '', model: '', tools: '' };
  const block = fm[1];
  const get = (key: string): string =>
    block.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'))?.[1]?.trim().replace(/^["']|["']$/g, '') ??
    '';
  return {
    description: get('description'),
    model: get('model'),
    tools: get('tools'),
  };
}

function readSkillDescription(skillMdPath: string): string {
  let content: string;
  try {
    content = readFileSync(skillMdPath, 'utf-8');
  } catch {
    return '';
  }
  const fm = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fm?.[1]) return '';
  const block = fm[1];
  return (
    block.match(/^description:\s*(.+)$/m)?.[1]?.trim().replace(/^["']|["']$/g, '') ?? ''
  );
}

// --- Option types ---

type SelectedItem =
  | { readonly kind: 'agent'; readonly name: string }
  | { readonly kind: 'skill'; readonly name: string }
  | { readonly kind: 'settings' };

type Action = 'remove' | 'update' | 'manage-skills';

// --- Detail formatters ---

interface ManifestSkillTriggers {
  readonly keywords?: readonly string[];
  readonly file_extensions?: readonly string[];
  readonly patterns?: readonly string[];
  readonly file_paths?: readonly string[];
}

function wrapText(text: string, maxWidth: number): string {
  if (maxWidth <= 0) return text;
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if (!current) {
      current = word;
    } else if (current.length + 1 + word.length <= maxWidth) {
      current += ' ' + word;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.join('\n');
}

function formatDescription(raw: string): string {
  const maxWidth = Math.max(40, (process.stdout.columns ?? 80) - 4);
  const unescaped = raw.replace(/\\n/g, '\n');
  const stripped = unescaped
    .replace(/<example>[\s\S]*?<\/example>/g, '')
    .replace(/Examples?\s+of\s+when\s+to\s+use\s+this\s+agent\s*:?\s*/gi, '')
    .trim();
  return stripped
    .split('\n')
    .map((line) => (line.trim() === '' ? '' : wrapText(line, maxWidth)))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// --- Detail display helpers ---

function buildAgentDetail(agentsDir: string, name: string): string {
  const agentPath = join(agentsDir, `${name}.md`);
  const meta = readAgentFullMeta(agentPath);
  const desc = formatDescription(meta.description || '');
  const lines: string[] = [];
  if (desc) lines.push(desc);
  lines.push(`Model: ${meta.model || 'inherit'}`);

  try {
    const content = readFileSync(agentPath, 'utf-8');
    const skills = parseAgentSkills(content);
    if (skills.length > 0) {
      lines.push(`Skills: ${skills.join(', ')}`);
    }
  } catch { /* no skills */ }

  return lines.join('\n');
}

function buildSkillDetail(
  skillsDir: string,
  name: string,
  skillTriggers: Map<string, ManifestSkillTriggers>,
  skillManifestDescs: Map<string, string>,
): string {
  const rawDesc =
    readSkillDescription(join(skillsDir, name, 'SKILL.md')) ||
    skillManifestDescs.get(name) ||
    '';
  const triggers = skillTriggers.get(name);
  const desc = formatDescription(rawDesc);
  const kw = triggers?.keywords?.length ? triggers.keywords.join(', ') : '(none)';
  const ext = triggers?.file_extensions?.length ? triggers.file_extensions.join(', ') : '(none)';
  const pat = triggers?.patterns?.length ? triggers.patterns.join(', ') : '(none)';
  const fp = triggers?.file_paths?.length ? triggers.file_paths.join(', ') : '(none)';
  const lines: string[] = [];
  if (desc) lines.push(desc);
  lines.push(`Keywords: ${kw}`);
  lines.push(`File extensions: ${ext}`);
  lines.push(`Patterns: ${pat}`);
  lines.push(`File paths: ${fp}`);
  return lines.join('\n');
}

// --- Main command ---

export async function runList(projectDir: string): Promise<void> {
  const agentsDir = join(projectDir, '.claude', 'agents');
  const skillsDir = join(projectDir, '.claude', 'skills');

  // Initial scan to check if anything exists
  const scanResult = scanInstalledItems(projectDir, agentsDir, skillsDir);
  if (!scanResult) {
    clack.log.warn('No grimoire-managed items found. Run `grimoire add` to get started.');
    return;
  }

  // Check for available updates once
  let updateResults = checkUpdates(projectDir);
  let updateMap = buildUpdateMap(updateResults);

  clack.intro('Grimoire — Installed Items');

  // Outer loop — item list
  while (true) {
    const scan = scanInstalledItems(projectDir, agentsDir, skillsDir);
    if (!scan) {
      clack.log.info('No items remaining.');
      break;
    }

    const { agentFiles, skillDirs, skillTriggers, skillManifestDescs } = scan;

    type SelectOption =
      | { value: { readonly kind: 'agent'; readonly name: string }; label: string; hint?: string }
      | { value: { readonly kind: 'skill'; readonly name: string }; label: string; hint?: string }
      | { value: { readonly kind: 'settings' }; label: string; hint?: string };
    const options: SelectOption[] = [];

    for (const f of agentFiles) {
      const name = f.replace(/\.md$/, '');
      const meta = readAgentFullMeta(join(agentsDir, f));
      const desc = meta.description;
      options.push({
        value: { kind: 'agent', name },
        label: `[agent] ${name}`,
        ...(desc ? { hint: desc.length > 80 ? desc.slice(0, 79) + '…' : desc } : {}),
      });
    }

    for (const d of skillDirs) {
      const desc =
        readSkillDescription(join(skillsDir, d, 'SKILL.md')) ||
        skillManifestDescs.get(d) ||
        '';
      options.push({
        value: { kind: 'skill', name: d },
        label: `[skill] ${d}`,
        ...(desc ? { hint: desc.length > 80 ? desc.slice(0, 79) + '…' : desc } : {}),
      });
    }

    // Settings option at the bottom
    options.push({
      value: { kind: 'settings' },
      label: '⚙ Settings',
      hint: 'global configuration',
    });

    const selected = await clack.select<SelectedItem>({
      message: 'Select an item to manage (Ctrl+C to exit)',
      options,
    });

    if (clack.isCancel(selected)) break;

    // Handle settings
    if (selected.kind === 'settings') {
      await runConfig(projectDir, { quiet: true });
      continue;
    }

    // Show detail and action menu for agent/skill
    const itemName = selected.name;
    const isAgent = selected.kind === 'agent';

    // Show detail via note
    const detail = isAgent
      ? buildAgentDetail(agentsDir, itemName)
      : buildSkillDetail(skillsDir, itemName, skillTriggers, skillManifestDescs);
    clack.note(detail, itemName);

    // Action menu — single action then exit
    const actionOptions: Array<{ value: Action; label: string; hint?: string }> = [
      { value: 'remove' as const, label: 'Remove' },
    ];

    const updateInfo = updateMap.get(itemName);
    if (updateInfo?.hasUpdate) {
      actionOptions.push({
        value: 'update' as const,
        label: `Update to v${updateInfo.availableVersion ?? '?'}`,
        hint: `installed: v${updateInfo.installedVersion ?? '?'}`,
      });
    }

    if (isAgent) {
      actionOptions.push({
        value: 'manage-skills' as const,
        label: 'Manage skills',
      });
    }

    const action = await clack.select<Action>({
      message: 'Choose an action',
      options: actionOptions,
    });

    if (clack.isCancel(action)) continue; // back to item list

    if (action === 'remove') {
      const confirmed = await clack.confirm({
        message: `Remove ${itemName}?`,
        initialValue: false,
      });

      if (!clack.isCancel(confirmed) && confirmed) {
        const item: InstallItem = {
          type: isAgent ? 'agent' : 'skill',
          name: itemName,
          sourcePath: '',
          description: '',
        };
        removeSingleItem(item, projectDir);
        clack.log.success(`Removed ${itemName}.`);
      }
    }

    if (action === 'update') {
      const info = updateMap.get(itemName)!;
      const item: InstallItem = {
        type: isAgent ? 'agent' : 'skill',
        name: itemName,
        sourcePath: info.sourcePath,
        description: '',
      };
      copyItems([item], info.packDir, projectDir);
      clack.log.success(`Updated ${itemName} to v${info.availableVersion ?? '?'}.`);

      // Re-apply enforce hooks if active
      try {
        const config = readGrimoireConfig(projectDir);
        if (config.enforcement) {
          const manifest = readManifest(projectDir);
          const agentsWithPatterns = Object.entries(manifest.agents)
            .filter(([, entry]) => entry.file_patterns && entry.file_patterns.length > 0)
            .map(([n]) => n);
          if (agentsWithPatterns.length > 0) {
            ensureEnforceHooks(projectDir, agentsWithPatterns);
          }
        }
      } catch {
        // No manifest or config
      }
    }

    if (action === 'manage-skills') {
      await runAgentSkillsFor(projectDir, itemName);
    }

    break; // exit after any completed action
  }

  clack.outro('Done.');
}

// --- Helpers ---

function scanInstalledItems(
  projectDir: string,
  agentsDir: string,
  skillsDir: string,
): {
  agentFiles: string[];
  skillDirs: string[];
  agentFilePatterns: Map<string, string[]>;
  skillTriggers: Map<string, ManifestSkillTriggers>;
  skillManifestDescs: Map<string, string>;
} | null {
  let managedAgentNames: Set<string> | null = null;
  let managedSkillDirNames: Set<string> | null = null;
  const agentFilePatterns = new Map<string, string[]>();
  const skillTriggers = new Map<string, ManifestSkillTriggers>();
  const skillManifestDescs = new Map<string, string>();

  try {
    const manifest = readManifest(projectDir);
    managedAgentNames = new Set(Object.keys(manifest.agents));
    managedSkillDirNames = new Set(manifest.skills.map((s) => basename(s.path)));
    for (const [name, entry] of Object.entries(manifest.agents)) {
      if (entry.file_patterns?.length) agentFilePatterns.set(name, entry.file_patterns);
    }
    for (const skill of manifest.skills) {
      const dirName = basename(skill.path);
      if (skill['triggers']) skillTriggers.set(dirName, skill['triggers'] as ManifestSkillTriggers);
      if (skill['description']) skillManifestDescs.set(dirName, skill['description'] as string);
    }
  } catch {
    return null;
  }

  const agentFiles: string[] =
    existsSync(agentsDir) && managedAgentNames !== null
      ? readdirSync(agentsDir)
          .filter((f) => f.endsWith('.md') && managedAgentNames!.has(f.replace(/\.md$/, '')))
          .sort()
      : [];

  const skillDirs: string[] =
    existsSync(skillsDir) && managedSkillDirNames !== null
      ? readdirSync(skillsDir)
          .filter((f) => {
            const full = join(skillsDir, f);
            return (
              statSync(full).isDirectory() &&
              existsSync(join(full, 'SKILL.md')) &&
              managedSkillDirNames!.has(f)
            );
          })
          .sort()
      : [];

  if (agentFiles.length === 0 && skillDirs.length === 0) return null;

  return { agentFiles, skillDirs, agentFilePatterns, skillTriggers, skillManifestDescs };
}

function buildUpdateMap(results: readonly UpdateCheckResult[]): Map<string, UpdateCheckResult> {
  const map = new Map<string, UpdateCheckResult>();
  for (const r of results) {
    map.set(r.item.name, r);
  }
  return map;
}
