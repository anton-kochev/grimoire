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
import { loadInvocations, resolveProjectDir, type InvocationProfile } from './transcripts.js';
import { parseGrantedTools, enforceContextFromLog, type AgentContext } from './insights-analysis.js';

const MAX_RUNS = 6;
const MAX_DEF_CHARS = 5000;
const MAX_TASK_CHARS = 1000;
const MAX_OUTCOME_CHARS = 400;
const MAX_SEQUENCE = 60;

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

/** Builds the reviewer prompt from an agent definition + real invocation traces. Pure. */
export function buildEvidencePrompt(
  agentType: string,
  agentDef: string | null,
  invocations: readonly InvocationProfile[],
  ctx: AgentContext = {},
): string {
  const recent = [...invocations]
    .sort((a, b) => (b.firstTs ?? '') < (a.firstTs ?? '') ? -1 : 1)
    .slice(0, MAX_RUNS);

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
  recent.forEach((v, i) => {
    const toolCounts = Object.entries(v.toolCounts).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}×${n}`).join(', ') || 'none';
    const files = [...new Set(v.filesTouched)];
    const events = v.toolEvents.length ? v.toolEvents : v.toolSequence.map((name) => ({ name, target: undefined, isError: false, errorText: undefined }));
    const order = events.slice(0, MAX_SEQUENCE)
      .map((e) => `${e.name}${e.target ? `(${e.target})` : ''}${e.isError ? '⚠' : ''}`)
      .join(' → ');
    lines.push(
      '',
      `### Run ${i + 1} — ${v.turns} turns, ${v.toolCalls} tool calls, ${v.tokens.output} output tokens, ${fmtSpan(v.spanMs)} wall-clock (includes idle)${v.toolErrors ? `, ${v.toolErrors} tool errors` : ''}${v.completed ? '' : ', DID NOT finish'}`,
      `Model: ${v.model ?? 'unknown'}`,
      `Task: ${v.taskPrompt.slice(0, MAX_TASK_CHARS) || '(unknown)'}`,
      `Tool counts: ${toolCounts}`,
      `Tool order: ${order}${events.length > MAX_SEQUENCE ? ' → …' : ''}`,
    );
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

/** Orchestrates: gather evidence for one agent type, then reason over it with the LLM. */
export function analyzeAgent(
  cwd: string,
  agentType: string,
  opts: { transcripts?: string | undefined; model?: string | undefined } = {},
): AnalysisResult {
  const projectDir = opts.transcripts ? resolve(cwd, opts.transcripts) : resolveProjectDir(cwd);
  if (!projectDir || !existsSync(projectDir)) {
    return { ok: false, agentType, error: 'No transcripts found for this project.' };
  }

  const invocations = loadInvocations(projectDir).filter((i) => i.agentType === agentType);
  if (!invocations.length) {
    return { ok: false, agentType, error: `No recorded runs for "${agentType}".` };
  }

  // Optional context: the agent's own definition + enforcement blocks against it
  let agentDef: string | null = null;
  const defPath = resolve(cwd, '.claude', 'agents', `${agentType}.md`);
  if (existsSync(defPath)) {
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

  const prompt = buildEvidencePrompt(agentType, agentDef, invocations, ctx);
  const res = runClaude(prompt, opts.model);
  return { ...res, agentType, runsAnalyzed: Math.min(invocations.length, MAX_RUNS) };
}
