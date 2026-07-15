/**
 * Sub-agent transcript archiving (SubagentStop hook).
 *
 * Claude Code purges `~/.claude/projects` transcripts after a retention window,
 * so the Agent Insights history would silently evaporate. When a sub-agent
 * finishes, the hook copies its raw transcript (gzipped) plus meta into a
 * project-local archive the CLI can read long after the source is gone:
 *
 *   <projectDir>/.claude/grimoire/sessions/<agentType>/<sessionId>/
 *     agent-<agentId>.jsonl.gz
 *     agent-<agentId>.meta.json
 *
 * Everything here is fail-silent (same contract as writeLog): hooks must never
 * throw, block, or emit stderr.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmdirSync, statSync, unlinkSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { dirname, join } from 'path';
import { gzipSync } from 'zlib';
import type { SubagentHookInput } from './types.js';
import { loadGrimoireConfig } from './grimoire-config.js';

const DEFAULT_RETAIN_RUNS_PER_AGENT = 20;

/**
 * Claude Code encodes the project cwd by replacing `/` and `.` with `-`.
 * Duplicated from packages/cli/src/transcripts.ts — the packages share no code.
 */
export function encodeProjectDirName(cwd: string): string {
  return cwd.replace(/[/.]/g, '-');
}

/**
 * Keeps archive path segments from escaping the sessions root: separators are
 * replaced, and a segment of only dots (`..`) is neutralized entirely.
 */
function sanitizeSegment(s: string): string {
  const cleaned = s.replace(/[^A-Za-z0-9._-]/g, '-');
  return /^\.+$/.test(cleaned) ? cleaned.replace(/\./g, '-') : cleaned;
}

/**
 * Locates the sub-agent transcript pair for a finished run.
 * Prefers the directory of the main `transcript_path`; falls back to the
 * encoded-cwd convention under the projects root. Null when not found.
 */
export function locateSubagentTranscript(
  input: SubagentHookInput,
  projectsRoot = join(homedir(), '.claude', 'projects'),
): { jsonl: string; meta: string } | null {
  // Newer Claude Code hands the exact sub-agent transcript path in the payload;
  // trust it directly (its sibling `.meta.json` holds the agent type).
  if (input.agent_transcript_path && existsSync(input.agent_transcript_path)) {
    return {
      jsonl: input.agent_transcript_path,
      meta: input.agent_transcript_path.replace(/\.jsonl$/, '.meta.json'),
    };
  }

  // Otherwise reconstruct it from the session root and agent_id.
  if (!input.agent_id || !input.session_id) return null;

  let sessionRoot: string | null = null;
  if (input.transcript_path) {
    sessionRoot = dirname(input.transcript_path);
  } else if (input.cwd) {
    sessionRoot = join(projectsRoot, encodeProjectDirName(input.cwd));
  }
  if (!sessionRoot) return null;

  const subDir = join(sessionRoot, input.session_id, 'subagents');
  const jsonl = join(subDir, `agent-${input.agent_id}.jsonl`);
  if (!existsSync(jsonl)) return null;
  return { jsonl, meta: join(subDir, `agent-${input.agent_id}.meta.json`) };
}

/**
 * Reads the `agentType` field from a sub-agent `meta.json`. Null when the file
 * is missing, malformed, or has no non-empty `agentType`.
 */
function readMetaAgentType(metaPath: string): string | null {
  try {
    const parsed = JSON.parse(readFileSync(metaPath, 'utf-8')) as unknown;
    if (parsed && typeof parsed === 'object') {
      const t = (parsed as Record<string, unknown>)['agentType'];
      if (typeof t === 'string' && t.trim()) return t;
    }
  } catch {
    // Missing or unreadable meta — fall through to null.
  }
  return null;
}

function asObj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function asArr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

/**
 * Extracts runtime-invoked skills from a Claude Code transcript. Malformed
 * lines and unknown shapes are ignored: hooks must never fail on transcript
 * schema drift.
 */
export function extractActivatedSkills(jsonlText: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of jsonlText.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let obj: Record<string, unknown> | null;
    try {
      obj = asObj(JSON.parse(trimmed));
    } catch {
      continue;
    }
    if (obj?.['type'] !== 'assistant') continue;
    for (const rawBlock of asArr(asObj(obj['message'])?.['content'])) {
      const block = asObj(rawBlock);
      if (block?.['type'] !== 'tool_use' || block['name'] !== 'Skill') continue;
      const skill = asObj(block['input'])?.['skill'];
      if (typeof skill !== 'string' || !skill || seen.has(skill)) continue;
      seen.add(skill);
      out.push(skill);
    }
  }
  return out;
}

const EDIT_TOOL_NAMES = new Set(['Edit', 'Write', 'MultiEdit']);

/**
 * True when the transcript contains an assistant Edit/Write/MultiEdit tool
 * use. Shares extractActivatedSkills' tolerance: malformed lines are ignored.
 */
export function transcriptHasEdits(jsonlText: string): boolean {
  for (const line of jsonlText.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let obj: Record<string, unknown> | null;
    try {
      obj = asObj(JSON.parse(trimmed));
    } catch {
      continue;
    }
    if (obj?.['type'] !== 'assistant') continue;
    for (const rawBlock of asArr(asObj(obj['message'])?.['content'])) {
      const block = asObj(rawBlock);
      if (
        block?.['type'] === 'tool_use' &&
        typeof block['name'] === 'string' &&
        EDIT_TOOL_NAMES.has(block['name'])
      ) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Resolves a finished run's agent type. The SubagentStop hook payload does NOT
 * carry `agent_type` (it comes through empty), so the authoritative source is
 * the sibling `meta.json`. Falls back to any `agent_type` on the payload for
 * callers that still supply one. Null when the type can't be determined.
 */
export function resolveAgentType(input: SubagentHookInput, projectsRoot?: string): string | null {
  const source = projectsRoot
    ? locateSubagentTranscript(input, projectsRoot)
    : locateSubagentTranscript(input);
  const fromMeta = source ? readMetaAgentType(source.meta) : null;
  if (fromMeta) return fromMeta;
  return input.agent_type?.trim() ? input.agent_type : null;
}

/**
 * Prunes one agent type's archive down to `retain` runs (oldest gz mtime first).
 * Races with parallel SubagentStop hooks are benign: a missing file is success.
 */
export function pruneAgentArchive(agentTypeDir: string, retain: number): void {
  let sessionDirs: string[];
  try {
    sessionDirs = readdirSync(agentTypeDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => join(agentTypeDir, d.name));
  } catch {
    return;
  }

  const runs: { gz: string; dir: string; mtimeMs: number }[] = [];
  for (const dir of sessionDirs) {
    try {
      for (const f of readdirSync(dir)) {
        if (!f.startsWith('agent-') || !f.endsWith('.jsonl.gz')) continue;
        const gz = join(dir, f);
        runs.push({ gz, dir, mtimeMs: statSync(gz).mtimeMs });
      }
    } catch {
      /* keep pruning the rest */
    }
  }

  if (runs.length <= retain) return;

  runs.sort((a, b) => a.mtimeMs - b.mtimeMs);
  for (const run of runs.slice(0, runs.length - retain)) {
    try { unlinkSync(run.gz); } catch { /* raced — already gone */ }
    try { unlinkSync(run.gz.replace(/\.jsonl\.gz$/, '.meta.json')); } catch { /* optional */ }
    try { rmdirSync(run.dir); } catch { /* not empty or raced — fine */ }
  }
}

/**
 * Archives a finished sub-agent run into the project-local sessions store.
 * Returns whether a transcript was archived. Never throws.
 */
export function archiveSubagentRun(
  input: SubagentHookInput,
  projectDir: string,
  projectsRoot?: string,
): boolean {
  try {
    if (!input.agent_id) return false;

    const insights = loadGrimoireConfig(projectDir).insights ?? {};
    if (insights.archive === false) return false;
    const retain = typeof insights.retainRunsPerAgent === 'number'
      ? insights.retainRunsPerAgent
      : DEFAULT_RETAIN_RUNS_PER_AGENT;
    if (retain <= 0) return false;

    const source = projectsRoot
      ? locateSubagentTranscript(input, projectsRoot)
      : locateSubagentTranscript(input);
    if (!source) return false;

    // The stop payload omits the agent type; the sibling meta.json is the
    // source of truth. Fall back to the payload for callers that pass one.
    const agentType = readMetaAgentType(source.meta) ?? (input.agent_type?.trim() ? input.agent_type : null);
    if (!agentType) return false;

    const agentTypeDir = join(
      projectDir, '.claude', 'grimoire', 'sessions', sanitizeSegment(agentType),
    );
    const sessionDir = join(agentTypeDir, sanitizeSegment(input.session_id));
    mkdirSync(sessionDir, { recursive: true });

    // gzip the transcript, write atomically (.tmp + rename)
    const gzPath = join(sessionDir, `agent-${sanitizeSegment(input.agent_id)}.jsonl.gz`);
    writeFileSync(`${gzPath}.tmp`, gzipSync(readFileSync(source.jsonl)));
    renameSync(`${gzPath}.tmp`, gzPath);

    // meta stays uncompressed: enumeration/pruning/dedup never gunzip
    const metaPath = join(sessionDir, `agent-${sanitizeSegment(input.agent_id)}.meta.json`);
    try {
      writeFileSync(metaPath, readFileSync(source.meta));
    } catch {
      writeFileSync(metaPath, JSON.stringify({ agentType, description: '' }));
    }

    pruneAgentArchive(agentTypeDir, retain);
    return true;
  } catch {
    // Fail silent — never block the user or produce stderr from a hook
    return false;
  }
}
