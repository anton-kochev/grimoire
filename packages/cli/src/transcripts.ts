/**
 * Discovery + defensive parsing of Claude Code sub-agent transcripts.
 *
 * Claude Code writes each sub-agent invocation to its own file:
 *   ~/.claude/projects/<encoded-cwd>/<sessionId>/subagents/agent-<agentId>.jsonl
 *   ~/.claude/projects/<encoded-cwd>/<sessionId>/subagents/agent-<agentId>.meta.json
 *
 * The JSONL schema is INTERNAL to Claude Code and changes between versions, so
 * everything here is defensive: unknown/missing/renamed fields never throw, and
 * a malformed line is counted and skipped rather than aborting the parse.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';

const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit']);

export interface InvocationTokens {
  output: number;
  input: number;
  cacheRead: number;
  cacheCreation: number;
  /** input + cacheRead + cacheCreation + output */
  total: number;
}

/** One tool call with its target and (when correlated via tool_use_id) its error. */
export interface ToolEvent {
  name: string;
  /** file_path / first line of command / pattern / url — whichever the input carries */
  target?: string | undefined;
  isError: boolean;
  errorText?: string | undefined;
}

/**
 * One chronological step of a sub-agent's session. Tool steps hold a reference
 * to the same ToolEvent recorded in `toolEvents`, so is_error correlation that
 * runs after the tool call is issued is reflected here automatically.
 */
export type TimelineItem =
  | { kind: 'thinking'; text: string }
  | { kind: 'text'; text: string }
  | { kind: 'tool'; event: ToolEvent };

export interface InvocationProfile {
  agentId: string;
  agentType: string;
  description: string;
  sessionId: string;
  model: string | null;
  toolCounts: Record<string, number>;
  toolSequence: string[];
  /** toolSequence enriched with targets and correlated errors */
  toolEvents: ToolEvent[];
  toolCalls: number;
  turns: number;
  tokens: InvocationTokens;
  firstTs: string | null;
  lastTs: string | null;
  spanMs: number;
  toolErrors: number;
  /** file paths from Edit/Write/MultiEdit tool calls, including duplicates */
  filesTouched: string[];
  /** max number of edits to any single file (thrash signal) */
  maxFileEdits: number;
  /** intermediate assistant reasoning: the initial plan + text preceding errored calls */
  reasoningSnippets: string[];
  /** full chronological session: thinking, text and tool steps in order */
  timeline: TimelineItem[];
  /** the task the sub-agent was given (its first user message), truncated */
  taskPrompt: string;
  finalText: string;
  completed: boolean;
  /** malformed transcript lines skipped during parse */
  parseErrors: number;
}

/** Extracts plain text from a transcript message.content (string or block array). */
function contentText(content: unknown): string {
  if (typeof content === 'string') return content;
  const parts: string[] = [];
  for (const raw of asArr(content)) {
    const block = asObj(raw);
    if (block?.['type'] === 'text') {
      const t = asStr(block['text']);
      if (t) parts.push(t);
    }
  }
  return parts.join('\n');
}

// =============================================================================
// Small, null-safe accessors
// =============================================================================

function asObj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}
function asArr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}
function asStr(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}
function asNum(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

const MAX_TARGET_CHARS = 120;
const MAX_ERROR_CHARS = 200;
const MAX_SNIPPET_CHARS = 300;
const MAX_SNIPPETS = 3;
/** Per-item cap for thinking/text timeline entries — bounds memory; the prompt budgeter truncates further. */
const MAX_TIMELINE_ITEM_CHARS = 2000;

/** Repo-root-relative form of an absolute path; unchanged if outside the repo. */
function toRepoRelative(p: string, cwd: string | null): string {
  if (!cwd) return p;
  const norm = p.replace(/\\/g, '/');
  const base = cwd.replace(/\\/g, '/').replace(/\/+$/, '');
  return norm.startsWith(base + '/') ? norm.slice(base.length + 1) : p;
}

/** Best-effort human-readable target of a tool call from its input object. */
function toolTarget(input: unknown, cwd: string | null): string | undefined {
  const obj = asObj(input);
  if (!obj) return undefined;
  const cmd = asStr(obj['command']);
  const fp = asStr(obj['file_path']);
  const raw = fp ?? (cmd ? cmd.split('\n', 1)[0] : undefined)
    ?? asStr(obj['pattern']) ?? asStr(obj['url']) ?? asStr(obj['query']) ?? asStr(obj['path']);
  if (!raw) return undefined;
  // A file_path is a repo file — show it relative to the repo root (shorter,
  // portable, no longer truncated). Commands/globs/urls stay verbatim.
  const shown = raw === fp ? toRepoRelative(raw, cwd) : raw;
  return shown.slice(0, MAX_TARGET_CHARS);
}

// =============================================================================
// Pure parse of one sub-agent transcript
// =============================================================================

export function parseInvocation(
  agentId: string,
  sessionId: string,
  jsonlText: string,
  meta: { agentType?: string; description?: string },
): InvocationProfile {
  const toolCounts: Record<string, number> = {};
  const toolSequence: string[] = [];
  const toolEvents: ToolEvent[] = [];
  const timeline: TimelineItem[] = [];
  const eventById = new Map<string, ToolEvent>();
  const precedingTextIdx = new Map<ToolEvent, number>();
  const texts: string[] = [];
  const filesTouched: string[] = [];
  const tokens: InvocationTokens = { output: 0, input: 0, cacheRead: 0, cacheCreation: 0, total: 0 };

  let turns = 0;
  let toolCalls = 0;
  let toolErrors = 0;
  let model: string | null = null;
  let firstTs: string | null = null;
  let lastTs: string | null = null;
  let taskPrompt = '';
  let parseErrors = 0;
  let cwd: string | null = null;

  for (const line of jsonlText.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let obj: Record<string, unknown> | null;
    try {
      obj = asObj(JSON.parse(trimmed));
    } catch {
      parseErrors++;
      continue;
    }
    if (!obj) continue;

    // cwd is stamped on every transcript line; capture the first we see so
    // tool_use blocks on later lines can be shown relative to the repo root.
    if (!cwd) {
      const c = asStr(obj['cwd']);
      if (c) cwd = c;
    }

    const ts = asStr(obj['timestamp']);
    if (ts) {
      if (firstTs === null || ts < firstTs) firstTs = ts;
      if (lastTs === null || ts > lastTs) lastTs = ts;
    }

    // Errors: prefer tool_result blocks (`is_error` + text, correlated by
    // tool_use_id); fall back to the coarser toolUseResult heuristic.
    if (obj['type'] === 'user') {
      let lineErrors = 0;
      for (const rawBlock of asArr(asObj(obj['message'])?.['content'])) {
        const block = asObj(rawBlock);
        if (block?.['type'] !== 'tool_result' || block['is_error'] !== true) continue;
        lineErrors++;
        const id = asStr(block['tool_use_id']);
        const event = id ? eventById.get(id) : undefined;
        if (event) {
          event.isError = true;
          const text = contentText(block['content']);
          if (text.trim()) event.errorText = text.trim().slice(0, MAX_ERROR_CHARS);
        }
      }
      const turObj = asObj(obj['toolUseResult']);
      if (!lineErrors && turObj) {
        const interrupted = turObj['interrupted'] === true;
        const stderr = asStr(turObj['stderr']);
        if (interrupted || (stderr && stderr.trim())) {
          lineErrors = 1;
          const last = toolEvents[toolEvents.length - 1];
          if (last && !last.isError) {
            last.isError = true;
            if (stderr?.trim()) last.errorText = stderr.trim().slice(0, MAX_ERROR_CHARS);
          }
        }
      }
      toolErrors += lineErrors;
    }

    // First user message = the task the sub-agent was handed
    if (obj['type'] === 'user' && !taskPrompt) {
      const text = contentText(asObj(obj['message'])?.['content']);
      if (text.trim()) taskPrompt = text.trim();
    }

    if (obj['type'] !== 'assistant') continue;

    turns++;
    const message = asObj(obj['message']);
    if (!message) continue;

    const m = asStr(message['model']);
    if (m) model = m;

    const usage = asObj(message['usage']);
    if (usage) {
      tokens.output += asNum(usage['output_tokens']);
      tokens.input += asNum(usage['input_tokens']);
      tokens.cacheRead += asNum(usage['cache_read_input_tokens']);
      tokens.cacheCreation += asNum(usage['cache_creation_input_tokens']);
    }

    for (const rawBlock of asArr(message['content'])) {
      const block = asObj(rawBlock);
      if (!block) continue;
      const btype = block['type'];
      if (btype === 'tool_use') {
        const name = asStr(block['name']) ?? 'unknown';
        toolCalls++;
        toolCounts[name] = (toolCounts[name] ?? 0) + 1;
        toolSequence.push(name);
        const event: ToolEvent = { name, isError: false };
        const target = toolTarget(block['input'], cwd);
        if (target) event.target = target;
        toolEvents.push(event);
        timeline.push({ kind: 'tool', event }); // same ref → error correlation shows here
        precedingTextIdx.set(event, texts.length - 1);
        const id = asStr(block['id']);
        if (id) eventById.set(id, event);
        if (EDIT_TOOLS.has(name)) {
          const fp = asStr(asObj(block['input'])?.['file_path']);
          if (fp) filesTouched.push(toRepoRelative(fp, cwd));
        }
      } else if (btype === 'text') {
        const t = asStr(block['text']);
        if (t && t.trim()) {
          texts.push(t.trim());
          timeline.push({ kind: 'text', text: t.trim().slice(0, MAX_TIMELINE_ITEM_CHARS) });
        }
      } else if (btype === 'thinking') {
        const t = asStr(block['thinking']); // absent/redacted_thinking → skipped
        if (t && t.trim()) timeline.push({ kind: 'thinking', text: t.trim().slice(0, MAX_TIMELINE_ITEM_CHARS) });
      }
    }
  }

  tokens.total = tokens.output + tokens.input + tokens.cacheRead + tokens.cacheCreation;

  const spanMs =
    firstTs && lastTs ? Math.max(0, new Date(lastTs).getTime() - new Date(firstTs).getTime()) : 0;

  // max edits to any single file
  const perFile: Record<string, number> = {};
  for (const f of filesTouched) perFile[f] = (perFile[f] ?? 0) + 1;
  const maxFileEdits = filesTouched.length ? Math.max(...Object.values(perFile)) : 0;

  // The last assistant text is the outcome; intermediate texts are reasoning.
  // Keep the initial plan + the text preceding each errored call (the "why").
  const finalText = texts[texts.length - 1] ?? '';
  const intermediate = texts.slice(0, -1);
  const reasoningSnippets: string[] = [];
  const addSnippet = (t: string | undefined) => {
    if (!t || reasoningSnippets.length >= MAX_SNIPPETS) return;
    const s = t.slice(0, MAX_SNIPPET_CHARS);
    if (!reasoningSnippets.includes(s)) reasoningSnippets.push(s);
  };
  addSnippet(intermediate[0]);
  for (const event of toolEvents) {
    if (!event.isError) continue;
    const idx = precedingTextIdx.get(event) ?? -1;
    if (idx >= 0 && idx < intermediate.length) addSnippet(intermediate[idx]);
  }

  return {
    agentId,
    agentType: meta.agentType ?? 'unknown',
    description: meta.description ?? '',
    sessionId,
    model,
    toolCounts,
    toolSequence,
    toolEvents,
    toolCalls,
    turns,
    tokens,
    firstTs,
    lastTs,
    spanMs,
    toolErrors,
    filesTouched,
    maxFileEdits,
    reasoningSnippets,
    timeline,
    taskPrompt: taskPrompt.slice(0, 1000),
    finalText: finalText.slice(0, 600),
    completed: finalText.length > 0,
    parseErrors,
  };
}

// =============================================================================
// Filesystem discovery
// =============================================================================

export function defaultTranscriptsRoot(): string {
  return join(homedir(), '.claude', 'projects');
}

/** Claude Code encodes the project cwd by replacing `/` and `.` with `-`. */
export function encodeProjectDirName(cwd: string): string {
  return cwd.replace(/[/.]/g, '-');
}

/**
 * Resolves the transcript project directory for a given project cwd.
 * Tries the encoded-name convention first, then falls back to scanning all
 * project dirs and matching a session file's own `cwd` field.
 */
export function resolveProjectDir(projectCwd: string, root = defaultTranscriptsRoot()): string | null {
  if (!existsSync(root)) return null;

  const encoded = join(root, encodeProjectDirName(projectCwd));
  if (existsSync(encoded)) return encoded;

  // Fallback: match by the cwd recorded inside a session transcript
  let dirs: string[];
  try {
    dirs = readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
  } catch {
    return null;
  }
  for (const dir of dirs) {
    const full = join(root, dir);
    let files: string[];
    try {
      files = readdirSync(full).filter((f) => f.endsWith('.jsonl'));
    } catch {
      continue;
    }
    for (const f of files) {
      try {
        const firstLine = readFileSync(join(full, f), 'utf-8').split('\n', 1)[0] ?? '';
        const cwd = asStr(asObj(JSON.parse(firstLine))?.['cwd']);
        if (cwd === projectCwd) return full;
      } catch {
        /* keep scanning */
      }
    }
  }
  return null;
}

export interface SubagentFile {
  agentId: string;
  sessionId: string;
  jsonlPath: string;
  metaPath: string;
  /** transcript is gzipped (`.jsonl.gz`) — archived runs. */
  gz?: boolean;
  /** agent type from the archive dir layout, used when the meta file is absent. */
  agentTypeHint?: string;
}

/** Lists every `<session>/subagents/agent-*.jsonl` under a project dir. */
export function listSubagentFiles(projectDir: string): SubagentFile[] {
  const out: SubagentFile[] = [];
  let sessions: string[];
  try {
    sessions = readdirSync(projectDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
  } catch {
    return out;
  }
  for (const sessionId of sessions) {
    const subDir = join(projectDir, sessionId, 'subagents');
    if (!existsSync(subDir)) continue;
    let files: string[];
    try {
      files = readdirSync(subDir).filter((f) => f.startsWith('agent-') && f.endsWith('.jsonl'));
    } catch {
      continue;
    }
    for (const f of files) {
      const agentId = f.replace(/^agent-/, '').replace(/\.jsonl$/, '');
      out.push({
        agentId,
        sessionId,
        jsonlPath: join(subDir, f),
        metaPath: join(subDir, `agent-${agentId}.meta.json`),
      });
    }
  }
  return out;
}

/** Reads a transcript, transparently gunzipping archived (`.jsonl.gz`) files. Null on any failure. */
export function readTranscriptText(path: string, gz = false): string | null {
  try {
    const buf = readFileSync(path);
    return gz ? gunzipSync(buf).toString('utf-8') : buf.toString('utf-8');
  } catch {
    return null; // missing file or corrupt gzip — skip, never throw
  }
}

/** Reads a sub-agent `.meta.json`, falling back to the agent-type hint when absent. */
function readMeta(metaPath: string, agentTypeHint?: string): { agentType?: string; description?: string } {
  const meta: { agentType?: string; description?: string } = {};
  if (agentTypeHint) meta.agentType = agentTypeHint;
  try {
    const parsed = asObj(JSON.parse(readFileSync(metaPath, 'utf-8')));
    if (parsed) {
      const agentType = asStr(parsed['agentType']);
      const description = asStr(parsed['description']);
      if (agentType) meta.agentType = agentType; // meta wins over the dir-name hint
      if (description) meta.description = description;
    }
  } catch {
    /* meta optional */
  }
  return meta;
}

/** The project-local archive root the router writes to (`.claude/grimoire/sessions`). */
export function defaultArchiveRoot(projectCwd: string): string {
  return join(projectCwd, '.claude', 'grimoire', 'sessions');
}

/** Lists every archived `<agentType>/<session>/agent-*.jsonl[.gz]` under the archive root. */
export function listArchivedSubagentFiles(archiveRoot: string): SubagentFile[] {
  const out: SubagentFile[] = [];
  let typeDirs: string[];
  try {
    typeDirs = readdirSync(archiveRoot, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
  } catch {
    return out;
  }
  for (const agentType of typeDirs) {
    const typeDir = join(archiveRoot, agentType);
    let sessions: string[];
    try {
      sessions = readdirSync(typeDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
    } catch {
      continue;
    }
    for (const sessionId of sessions) {
      const sessionDir = join(typeDir, sessionId);
      let files: string[];
      try {
        files = readdirSync(sessionDir);
      } catch {
        continue;
      }
      for (const f of files) {
        if (!f.startsWith('agent-')) continue;
        const gz = f.endsWith('.jsonl.gz');
        if (!gz && !f.endsWith('.jsonl')) continue;
        const agentId = f.replace(/^agent-/, '').replace(/\.jsonl(\.gz)?$/, '');
        out.push({
          agentId,
          sessionId,
          jsonlPath: join(sessionDir, f),
          metaPath: join(sessionDir, `agent-${agentId}.meta.json`),
          gz,
          agentTypeHint: agentType,
        });
      }
    }
  }
  return out;
}

/** Loads and parses all sub-agent invocations found under a live project dir. */
export function loadInvocations(projectDir: string): InvocationProfile[] {
  return loadMergedInvocations(projectDir, null);
}

/**
 * Loads invocations from the live transcript dir and the gzipped archive,
 * deduped by agentId. On collision the longer transcript wins (a live run may
 * still be flushing after SubagentStop; a purged live run may be a stub); ties
 * go to the live copy.
 */
export function loadMergedInvocations(
  liveDir: string | null,
  archiveDir: string | null,
): InvocationProfile[] {
  const winners = new Map<string, { file: SubagentFile; text: string }>();

  const consider = (files: SubagentFile[]) => {
    for (const file of files) {
      const text = readTranscriptText(file.jsonlPath, file.gz);
      if (text === null) continue;
      const existing = winners.get(file.agentId);
      if (!existing || text.length > existing.text.length) {
        winners.set(file.agentId, { file, text });
      }
    }
  };

  // Live first so equal-length ties resolve in its favor.
  if (liveDir) consider(listSubagentFiles(liveDir));
  if (archiveDir) consider(listArchivedSubagentFiles(archiveDir));

  const out: InvocationProfile[] = [];
  for (const { file, text } of winners.values()) {
    out.push(parseInvocation(file.agentId, file.sessionId, text, readMeta(file.metaPath, file.agentTypeHint)));
  }
  return out;
}

/**
 * Loads and parses a single invocation by agentId across live + archive
 * (longer transcript wins, tie → live). Parses on demand — used to serve the
 * full timeline for one run without materializing every invocation. Null if not found.
 */
export function loadInvocationById(
  liveDir: string | null,
  archiveDir: string | null,
  agentId: string,
): InvocationProfile | null {
  const candidates: SubagentFile[] = [];
  if (liveDir) candidates.push(...listSubagentFiles(liveDir).filter((f) => f.agentId === agentId));
  if (archiveDir) candidates.push(...listArchivedSubagentFiles(archiveDir).filter((f) => f.agentId === agentId));

  let best: { file: SubagentFile; text: string } | null = null;
  for (const file of candidates) {
    const text = readTranscriptText(file.jsonlPath, file.gz);
    if (text === null) continue;
    if (!best || text.length > best.text.length) best = { file, text };
  }
  if (!best) return null;
  return parseInvocation(best.file.agentId, best.file.sessionId, best.text, readMeta(best.file.metaPath, best.file.agentTypeHint));
}
