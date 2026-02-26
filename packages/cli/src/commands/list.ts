import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { basename, join } from 'path';
import * as clack from '@clack/prompts';
import { readManifest } from '../enforce.js';

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
  | { readonly kind: 'skill'; readonly name: string };

// --- Detail formatters ---

interface ManifestSkillTriggers {
  readonly keywords?: readonly string[];
  readonly file_extensions?: readonly string[];
  readonly patterns?: readonly string[];
  readonly file_paths?: readonly string[];
}

function formatAgentDetail(
  meta: AgentFullMeta,
  enforced: boolean,
  filePatterns: readonly string[] | undefined,
  fallbackDesc: string,
): string {
  const desc = meta.description || fallbackDesc;
  const lines: string[] = [];
  lines.push('Description:');
  lines.push(`  ${desc}`);
  lines.push('');
  lines.push(`Model:   ${meta.model || 'inherit'}`);
  lines.push(`Tools:   ${meta.tools || '(not specified)'}`);
  lines.push('');
  if (enforced) {
    const patterns = filePatterns?.length ? filePatterns.join(', ') : '(none)';
    lines.push(`Enforce: yes  (file patterns: ${patterns})`);
  } else {
    lines.push('Enforce: no');
  }
  return lines.join('\n');
}

function formatSkillDetail(
  description: string,
  triggers: ManifestSkillTriggers | undefined,
): string {
  const lines: string[] = [];
  lines.push('Description:');
  lines.push(`  ${description || '(no description)'}`);
  lines.push('');
  lines.push('Auto-activation triggers:');

  if (!triggers) {
    lines.push('  (no triggers configured)');
  } else {
    const kw = triggers.keywords?.length ? triggers.keywords.join(', ') : '(none)';
    const ext = triggers.file_extensions?.length ? triggers.file_extensions.join(', ') : '(none)';
    const pat = triggers.patterns?.length ? triggers.patterns.join(', ') : '(none)';
    const fp = triggers.file_paths?.length ? triggers.file_paths.join(', ') : '(none)';
    lines.push(`  Keywords:        ${kw}`);
    lines.push(`  File extensions: ${ext}`);
    lines.push(`  Patterns:        ${pat}`);
    lines.push(`  File paths:      ${fp}`);
  }
  return lines.join('\n');
}

// --- Main command ---

export async function runList(projectDir: string): Promise<void> {
  const agentsDir = join(projectDir, '.claude', 'agents');
  const skillsDir = join(projectDir, '.claude', 'skills');

  let managedAgentNames: Set<string> | null = null;
  let managedSkillDirNames: Set<string> | null = null;
  const enforcedAgents = new Set<string>();
  const agentFilePatterns = new Map<string, string[]>();

  // skill triggers keyed by dir name
  const skillTriggers = new Map<string, ManifestSkillTriggers>();
  const skillManifestDescs = new Map<string, string>();

  try {
    const manifest = readManifest(projectDir);
    managedAgentNames = new Set(Object.keys(manifest.agents));
    managedSkillDirNames = new Set(manifest.skills.map((s) => basename(s.path)));
    for (const [name, entry] of Object.entries(manifest.agents)) {
      if (entry.enforce) enforcedAgents.add(name);
      if (entry.file_patterns?.length) agentFilePatterns.set(name, entry.file_patterns);
    }
    for (const skill of manifest.skills) {
      const dirName = basename(skill.path);
      if (skill['triggers']) skillTriggers.set(dirName, skill['triggers'] as ManifestSkillTriggers);
      if (skill['description']) skillManifestDescs.set(dirName, skill['description'] as string);
    }
  } catch {
    // manifest absent — nothing was installed by grimoire
  }

  const agentNames = managedAgentNames;
  const agentFiles: string[] =
    existsSync(agentsDir) && agentNames !== null
      ? readdirSync(agentsDir)
          .filter((f) => f.endsWith('.md') && agentNames.has(f.replace(/\.md$/, '')))
          .sort()
      : [];

  const skillDirNames = managedSkillDirNames;
  const skillDirs: string[] =
    existsSync(skillsDir) && skillDirNames !== null
      ? readdirSync(skillsDir)
          .filter((f) => {
            const full = join(skillsDir, f);
            return (
              statSync(full).isDirectory() &&
              existsSync(join(full, 'SKILL.md')) &&
              skillDirNames.has(f)
            );
          })
          .sort()
      : [];

  if (agentFiles.length === 0 && skillDirs.length === 0) {
    clack.log.warn('No grimoire-managed items found. Run `grimoire add` to get started.');
    return;
  }

  // Build select options
  const options: Array<
    | { value: { kind: 'agent'; name: string }; label: string; hint?: string }
    | { value: { kind: 'skill'; name: string }; label: string; hint?: string }
  > = [];

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

  clack.intro('Grimoire — Installed Items');

  while (true) {
    const selected = await clack.select<SelectedItem>({
      message: 'Select an item to view details  (Ctrl+C to exit)',
      options,
    });

    if (clack.isCancel(selected)) break;

    if (selected.kind === 'agent') {
      const meta = readAgentFullMeta(join(agentsDir, `${selected.name}.md`));
      const enforced = enforcedAgents.has(selected.name);
      const patterns = agentFilePatterns.get(selected.name);
      const detail = formatAgentDetail(meta, enforced, patterns, '');
      clack.note(detail, selected.name);
    } else {
      const desc =
        readSkillDescription(join(skillsDir, selected.name, 'SKILL.md')) ||
        skillManifestDescs.get(selected.name) ||
        '';
      const triggers = skillTriggers.get(selected.name);
      const detail = formatSkillDetail(desc, triggers);
      clack.note(detail, selected.name);
    }
  }

  clack.outro('Done.');
}
