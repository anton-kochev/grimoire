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

const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit']);

export interface InvocationTokens {
  output: number;
  input: number;
  cacheRead: number;
  cacheCreation: number;
  /** input + cacheRead + cacheCreation + output */
  total: number;
}

export interface InvocationProfile {
  agentId: string;
  agentType: string;
  description: string;
  sessionId: string;
  model: string | null;
  toolCounts: Record<string, number>;
  toolSequence: string[];
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
  const filesTouched: string[] = [];
  const tokens: InvocationTokens = { output: 0, input: 0, cacheRead: 0, cacheCreation: 0, total: 0 };

  let turns = 0;
  let toolCalls = 0;
  let toolErrors = 0;
  let model: string | null = null;
  let firstTs: string | null = null;
  let lastTs: string | null = null;
  let finalText = '';
  let taskPrompt = '';
  let parseErrors = 0;

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

    const ts = asStr(obj['timestamp']);
    if (ts) {
      if (firstTs === null || ts < firstTs) firstTs = ts;
      if (lastTs === null || ts > lastTs) lastTs = ts;
    }

    // Tool results carry error signals (object form; string form = success)
    const tur = obj['toolUseResult'];
    const turObj = asObj(tur);
    if (turObj) {
      const interrupted = turObj['interrupted'] === true;
      const stderr = asStr(turObj['stderr']);
      if (interrupted || (stderr && stderr.trim())) toolErrors++;
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
        if (EDIT_TOOLS.has(name)) {
          const fp = asStr(asObj(block['input'])?.['file_path']);
          if (fp) filesTouched.push(fp);
        }
      } else if (btype === 'text') {
        const t = asStr(block['text']);
        if (t && t.trim()) finalText = t.trim();
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

  return {
    agentId,
    agentType: meta.agentType ?? 'unknown',
    description: meta.description ?? '',
    sessionId,
    model,
    toolCounts,
    toolSequence,
    toolCalls,
    turns,
    tokens,
    firstTs,
    lastTs,
    spanMs,
    toolErrors,
    filesTouched,
    maxFileEdits,
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

interface SubagentFile {
  agentId: string;
  sessionId: string;
  jsonlPath: string;
  metaPath: string;
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

/** Loads and parses all sub-agent invocations found under a project dir. */
export function loadInvocations(projectDir: string): InvocationProfile[] {
  const out: InvocationProfile[] = [];
  for (const f of listSubagentFiles(projectDir)) {
    let jsonl: string;
    try {
      jsonl = readFileSync(f.jsonlPath, 'utf-8');
    } catch {
      continue;
    }
    const meta: { agentType?: string; description?: string } = {};
    try {
      const parsed = asObj(JSON.parse(readFileSync(f.metaPath, 'utf-8')));
      if (parsed) {
        const agentType = asStr(parsed['agentType']);
        const description = asStr(parsed['description']);
        if (agentType) meta.agentType = agentType;
        if (description) meta.description = description;
      }
    } catch {
      /* meta optional */
    }
    out.push(parseInvocation(f.agentId, f.sessionId, jsonl, meta));
  }
  return out;
}
