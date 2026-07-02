/**
 * LLM-backed reasoning over a sub-agent's real behavior.
 *
 * Assembles an evidence pack from the agent's definition + its actual transcript
 * traces, then shells out to the local Claude Code (`claude -p`) to produce an
 * evidence-cited critique. On-demand only — each call spends tokens.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { defaultArchiveRoot, loadInvocationById, loadMergedInvocations, resolveProjectDir, type InvocationProfile, type ToolEvent } from './transcripts.js';
import { resolveAgentDefPath } from './agent-defs.js';
import { parseGrantedTools, enforceContextFromLog, type AgentContext } from './insights-analysis.js';

const MAX_RUNS = 6;
const MAX_DEF_CHARS = 5000;
const MAX_TASK_CHARS = 1000;
const MAX_OUTCOME_CHARS = 400;
const MAX_SEQUENCE = 60;

// Interleaved-narrative budgeting (per-run char budgets sum to this total).
const TOTAL_NARRATIVE_BUDGET = 24_000;
const TOOL_LINE_MAX = 200;
const ERROR_TEXT_MAX = 160;
const REASONING_CAP = 400;
const REASONING_CAP_PRE_ERROR = 600; // the "why" right before a failure is worth more room

/** Formats a wall-clock span as `4m10s` / `38s` / `1h02m`. */
function fmtSpan(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m${String(s % 60).padStart(2, '0')}s`;
  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}m`;
}

export interface AnalysisResult {
  ok: boolean;
  agentType: string;
  result?: string | undefined;
  costUsd?: number | undefined;
  model?: string | undefined;
  durationMs?: number | undefined;
  runsAnalyzed?: number | undefined;
  error?: string | undefined;
}

/** The one-line run header shared by the narrative and legacy renderings. */
function runHeader(v: InvocationProfile, i: number): string {
  return `### Run ${i + 1} — ${v.turns} turns, ${v.toolCalls} tool calls, ${v.tokens.output} output tokens, ${fmtSpan(v.spanMs)} wall-clock (includes idle)${v.toolErrors ? `, ${v.toolErrors} tool errors` : ''}${v.completed ? '' : ', DID NOT finish'}`;
}

/**
 * Splits a total char budget across runs, giving unhealthy runs (tool errors or
 * unfinished) double the share of healthy ones. Pure.
 */
export function allocateRunBudgets(runs: readonly InvocationProfile[], total: number): number[] {
  if (runs.length === 0) return [];
  const weights = runs.map((r) => (r.toolErrors > 0 || !r.completed ? 2 : 1));
  const sum = weights.reduce((a, b) => a + b, 0);
  return weights.map((w) => Math.floor((total * w) / sum));
}

/** Renders one tool step, capping the error text and the whole line. */
function renderToolLine(ev: ToolEvent): string {
  const base = `[tool] ${ev.name}${ev.target ? `(${ev.target})` : ''}`;
  if (ev.isError) {
    const err = (ev.errorText ?? '(no error text)').slice(0, ERROR_TEXT_MAX);
    return `${base} ⚠ error: ${err}`.slice(0, TOOL_LINE_MAX);
  }
  return base.slice(0, TOOL_LINE_MAX);
}

/**
 * Renders one run as a chronological thought→action→result trace within a char
 * budget. Mandatory items (the plan, every errored tool + its preceding reason,
 * the outcome, and tool lines) always render; other reasoning fills the
 * remaining budget, and skipped stretches collapse into an elision marker. Pure.
 */
export function renderRunNarrative(v: InvocationProfile, index: number, budget: number): string {
  const lines: string[] = [
    runHeader(v, index),
    `Model: ${v.model ?? 'unknown'}`,
    `Task: ${v.taskPrompt.slice(0, MAX_TASK_CHARS) || '(unknown)'}`,
  ];
  let used = lines.reduce((n, l) => n + l.length, 0);

  const timeline = v.timeline;
  // The final text is the outcome — rendered separately, excluded from the trace.
  let outcomeIdx = -1;
  if (v.finalText) {
    for (let i = timeline.length - 1; i >= 0; i--) {
      if (timeline[i]!.kind === 'text') { outcomeIdx = i; break; }
    }
  }
  // The first reasoning item is the plan (always kept).
  let planIdx = -1;
  for (let i = 0; i < timeline.length; i++) {
    if (i === outcomeIdx) continue;
    const k = timeline[i]!.kind;
    if (k === 'thinking' || k === 'text') { planIdx = i; break; }
  }
  const precedesError = (i: number): boolean => {
    const next = timeline[i + 1];
    return !!next && next.kind === 'tool' && next.event.isError;
  };

  lines.push('Trace (chronological):');
  let toolCount = 0;
  let pendingElided = 0;
  const flush = () => {
    if (pendingElided > 0) { lines.push(`… (${pendingElided} reasoning blocks elided) …`); pendingElided = 0; }
  };

  for (let i = 0; i < timeline.length; i++) {
    if (i === outcomeIdx) continue;
    const item = timeline[i]!;
    if (item.kind === 'tool') {
      if (++toolCount > MAX_SEQUENCE) continue;
      flush();
      const s = renderToolLine(item.event);
      lines.push(s); used += s.length;
    } else {
      const preErr = precedesError(i);
      const s = `[${item.kind === 'thinking' ? 'thought' : 'text'}] "${item.text.slice(0, preErr ? REASONING_CAP_PRE_ERROR : REASONING_CAP)}"`;
      if (i === planIdx || preErr || used + s.length <= budget) {
        flush();
        lines.push(s); used += s.length;
      } else {
        pendingElided++;
      }
    }
  }
  flush();

  if (v.finalText) lines.push(`[outcome] "${v.finalText.slice(0, MAX_OUTCOME_CHARS)}"`);
  return lines.join('\n');
}

/** Legacy flat rendering, used for runs with no captured timeline. */
function renderRunLegacy(v: InvocationProfile, i: number): string {
  const toolCounts = Object.entries(v.toolCounts).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}×${n}`).join(', ') || 'none';
  const files = [...new Set(v.filesTouched)];
  const events = v.toolEvents.length ? v.toolEvents : v.toolSequence.map((name) => ({ name, target: undefined, isError: false, errorText: undefined }));
  const order = events.slice(0, MAX_SEQUENCE)
    .map((e) => `${e.name}${e.target ? `(${e.target})` : ''}${e.isError ? '⚠' : ''}`)
    .join(' → ');
  const lines = [
    runHeader(v, i),
    `Model: ${v.model ?? 'unknown'}`,
    `Task: ${v.taskPrompt.slice(0, MAX_TASK_CHARS) || '(unknown)'}`,
    `Tool counts: ${toolCounts}`,
    `Tool order: ${order}${events.length > MAX_SEQUENCE ? ' → …' : ''}`,
  ];
  const errored = v.toolEvents.filter((e) => e.isError);
  if (errored.length) {
    lines.push('Errors:');
    for (const e of errored) lines.push(`- ${e.name}${e.target ? `(${e.target})` : ''}: ${e.errorText ?? '(no error text)'}`);
  }
  if (v.reasoningSnippets.length) {
    lines.push('Reasoning excerpts (the agent\'s own intermediate thoughts):');
    for (const s of v.reasoningSnippets) lines.push(`- "${s}"`);
  }
  if (files.length) lines.push(`Files edited: ${files.join(', ')}${v.maxFileEdits > 1 ? ` (one file edited up to ${v.maxFileEdits}×)` : ''}`);
  lines.push(`Outcome: ${v.finalText.slice(0, MAX_OUTCOME_CHARS) || '(no final text)'}`);
  return lines.join('\n');
}

/** Builds the reviewer prompt from an agent definition + real invocation traces. Pure. */
export function buildEvidencePrompt(
  agentType: string,
  agentDef: string | null,
  invocations: readonly InvocationProfile[],
  ctx: AgentContext = {},
): string {
  // Select the MAX_RUNS most recent, then render oldest → newest so the reviewer
  // can read the agent's trajectory across runs (improvement, regressions, repeats).
  const recent = [...invocations]
    .sort((a, b) => (Date.parse(b.firstTs ?? '') || 0) - (Date.parse(a.firstTs ?? '') || 0))
    .slice(0, MAX_RUNS)
    .reverse();

  const lines: string[] = [];
  lines.push(
    `You are an expert reviewer of Claude Code sub-agents. Help the author improve the sub-agent "${agentType}" based on how it ACTUALLY behaved across real runs. Reason strictly from the evidence below — do not invent problems.`,
    '',
  );

  lines.push(`## Agent definition`);
  if (agentDef) {
    lines.push('```', agentDef.slice(0, MAX_DEF_CHARS).trim(), '```');
  } else {
    lines.push('(Built-in agent — no local definition file. Reason from behavior only; do not propose editing a prompt/tools you cannot see.)');
  }
  if (ctx.grantedTools?.length) lines.push(`Granted tools (frontmatter): ${ctx.grantedTools.join(', ')}`);
  if (ctx.outOfLaneBlocks) {
    lines.push(`Enforcement: blocked ${ctx.outOfLaneBlocks}× trying to edit files it does not own${ctx.outOfLaneFiles?.length ? ` (e.g. ${ctx.outOfLaneFiles.slice(0, 5).join(', ')})` : ''}.`);
  }
  lines.push('');

  lines.push(`## Observed runs (the ${recent.length} most recent of ${invocations.length} recorded)`);
  lines.push('Ordered oldest → newest — watch for changes across runs (a fix that stuck, a regression, a mistake it keeps repeating).');
  const budgets = allocateRunBudgets(recent, TOTAL_NARRATIVE_BUDGET);
  recent.forEach((v, i) => {
    lines.push('');
    // Timeline-backed runs get the interleaved narrative; older/legacy profiles
    // (no captured timeline) fall back to the flat rendering.
    lines.push(v.timeline.length > 0 ? renderRunNarrative(v, i, budgets[i] ?? TOTAL_NARRATIVE_BUDGET) : renderRunLegacy(v, i));
  });

  lines.push(
    '',
    '## Your task',
    'Write a review with exactly these three markdown sections:',
    '',
    '## How this agent behaves',
    '2–3 sentences reconstructing the agent\'s working style from the runs above: how it approaches a task, its characteristic tool rhythm, where it spends its effort. Descriptive, no judgment.',
    '',
    '## Working well',
    'Up to 3 bullets, one line each: a pattern worth keeping + its evidence. If little stands out, one line is fine.',
    '',
    '## Suggestions (highest impact first)',
    'Up to 4, numbered. Format each EXACTLY as:',
    '1. **[lever]** <one imperative sentence stating the concrete change — what to edit and how, e.g. "Add to the prompt: after editing a .proto file, regenerate the client stubs before running tests">',
    '   - Evidence: <runs + pattern frequency, e.g. "2 shell-syntax errors in Run 1; 4/6 runs re-read the same file"> · Confidence: high|medium · Expected effect: <which number above should move, and how>',
    'The first line must be actionable on its own — the reader applies it without reading the evidence. Diagnosis goes in the Evidence line, never before the change. Valid levers: prompt, tools, file_patterns, skills, model.',
    'Every suggestion must be justified by observed cost in the runs above: tool errors, retries, redundant work, unfinished tasks, or blown scope. Style polish without observed cost does not qualify — omit it, and omit anything you would only rate low confidence. If the runs look healthy, say so plainly and leave this section empty rather than inventing issues.',
    '',
    'Rules:',
    '- Keep the whole review under ~250 words. No preamble, no closing remarks, no restating the stats.',
    `- Cite ONLY evidence shown above (tool order with targets, errors, reasoning excerpts, counts). Never invent file names, line numbers, or events.`,
    `- ${recent.length} runs is a small sample — distinguish systemic patterns ("4/6 runs") from one-offs, and label one-offs as such.`,
    '- You have no tools and cannot browse or verify externally. Respond with just the review in concise markdown; do not attempt any actions.',
  );

  return lines.join('\n');
}

/** Runs `claude -p` over a prompt from a neutral cwd. Impure. */
export function runClaude(prompt: string, model = 'haiku', timeoutMs = 180000): AnalysisResult {
  try {
    const proc = spawnSync('claude', [
      '-p',
      '--output-format', 'json',
      '--model', model,
      '--tools', '',            // no tools → single-shot reasoning, no web/file side effects
      '--strict-mcp-config',    // ignore any MCP servers
    ], {
      input: prompt,
      cwd: tmpdir(), // neutral cwd → skip the project's CLAUDE.md and MCP tool schemas
      encoding: 'utf-8',
      timeout: timeoutMs,
      maxBuffer: 20 * 1024 * 1024,
    });
    if (proc.error) return { ok: false, agentType: '', error: `Could not run \`claude\`: ${proc.error.message}` };
    if (proc.status !== 0) {
      return { ok: false, agentType: '', error: (proc.stderr || '').slice(0, 500) || `claude exited with code ${proc.status}` };
    }
    const parsed = JSON.parse(proc.stdout) as Record<string, unknown>;
    if (parsed['is_error']) return { ok: false, agentType: '', error: String(parsed['result'] ?? 'analysis error') };
    return {
      ok: true,
      agentType: '',
      result: typeof parsed['result'] === 'string' ? parsed['result'] : '',
      costUsd: typeof parsed['total_cost_usd'] === 'number' ? parsed['total_cost_usd'] : undefined,
      durationMs: typeof parsed['duration_ms'] === 'number' ? parsed['duration_ms'] : undefined,
      model,
    };
  } catch (e) {
    return { ok: false, agentType: '', error: e instanceof Error ? e.message : 'analysis failed' };
  }
}

/** Resolves the live + archive dirs from analyze options. */
function resolveDirs(
  cwd: string,
  opts: { transcripts?: string | undefined; sessions?: string | undefined },
): { liveDir: string | null; archiveDir: string | null } {
  const live = opts.transcripts ? resolve(cwd, opts.transcripts) : resolveProjectDir(cwd);
  const archive = opts.sessions ? resolve(cwd, opts.sessions) : defaultArchiveRoot(cwd);
  return {
    liveDir: live && existsSync(live) ? live : null,
    archiveDir: existsSync(archive) ? archive : null,
  };
}

/** Loads the agent's own definition + any enforcement context recorded against it. */
function loadAgentContext(cwd: string, agentType: string): { agentDef: string | null; ctx: AgentContext } {
  let agentDef: string | null = null;
  const defPath = resolveAgentDefPath(cwd, agentType);
  if (defPath) {
    try { agentDef = readFileSync(defPath, 'utf-8'); } catch { /* optional */ }
  }
  const ctx: AgentContext = {};
  if (agentDef) {
    const granted = parseGrantedTools(agentDef);
    if (granted.length) ctx.grantedTools = granted;
  }
  const logPath = resolve(cwd, '.claude', 'logs', 'grimoire-router.log');
  if (existsSync(logPath)) {
    try {
      const enforce = enforceContextFromLog(readFileSync(logPath, 'utf-8'))[agentType];
      if (enforce) Object.assign(ctx, enforce);
    } catch { /* optional */ }
  }
  return { agentDef, ctx };
}

/** Orchestrates: gather evidence for one agent type, then reason over it with the LLM. */
export function analyzeAgent(
  cwd: string,
  agentType: string,
  opts: { transcripts?: string | undefined; sessions?: string | undefined; model?: string | undefined } = {},
): AnalysisResult {
  const { liveDir, archiveDir } = resolveDirs(cwd, opts);
  if (!liveDir && !archiveDir) {
    return { ok: false, agentType, error: 'No transcripts found for this project.' };
  }

  const invocations = loadMergedInvocations(liveDir, archiveDir).filter((i) => i.agentType === agentType);
  if (!invocations.length) {
    return { ok: false, agentType, error: `No recorded runs for "${agentType}".` };
  }

  const { agentDef, ctx } = loadAgentContext(cwd, agentType);
  const prompt = buildEvidencePrompt(agentType, agentDef, invocations, ctx);
  const res = runClaude(prompt, opts.model);
  return { ...res, agentType, runsAnalyzed: Math.min(invocations.length, MAX_RUNS) };
}

/**
 * Reviews a single session (one invocation, by agentId). Same evidence pipeline
 * as `analyzeAgent` but scoped to that one run. Does not persist — the caller
 * saves the result into the session's archive dir.
 */
export function analyzeSession(
  cwd: string,
  agentId: string,
  opts: { transcripts?: string | undefined; sessions?: string | undefined; model?: string | undefined } = {},
): AnalysisResult {
  const { liveDir, archiveDir } = resolveDirs(cwd, opts);
  if (!liveDir && !archiveDir) {
    return { ok: false, agentType: '', error: 'No transcripts found for this project.' };
  }

  const invocation = loadInvocationById(liveDir, archiveDir, agentId);
  if (!invocation) {
    return { ok: false, agentType: '', error: `No recorded run for "${agentId}".` };
  }

  const { agentType } = invocation;
  const { agentDef, ctx } = loadAgentContext(cwd, agentType);
  const prompt = buildEvidencePrompt(agentType, agentDef, [invocation], ctx);
  const res = runClaude(prompt, opts.model);
  return { ...res, agentType, runsAnalyzed: 1 };
}
