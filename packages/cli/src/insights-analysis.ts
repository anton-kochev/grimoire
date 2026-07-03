/**
 * Pure analysis over parsed sub-agent invocations.
 *
 * Turns raw per-invocation profiles into per-agent-type aggregates (facts only).
 * Interpretation is NOT done here with hand-picked thresholds — that lives in
 * agent-analysis.ts, which reasons over the evidence with an LLM. This module
 * only computes numbers and the context an analysis can cite.
 */

import type { InvocationProfile } from './transcripts.js';

export interface AgentProfile {
  agentType: string;
  invocations: number;
  models: string[];
  totalToolCalls: number;
  avgToolCalls: number;
  toolMix: Record<string, number>;
  skillMix: Record<string, number>;
  avgTurns: number;
  totalOutputTokens: number;
  avgOutputTokens: number;
  avgTotalTokens: number;
  avgSpanMs: number;
  maxSpanMs: number;
  toolErrorRate: number;
  incompleteRate: number;
  distinctFiles: number;
  maxFileEdits: number;
  /** factual composite used only to sort the roster */
  attention: number;
}

/** Optional per-agent context the LLM analysis can cite. */
export interface AgentContext {
  /** Tools granted in the agent's frontmatter (`tools:`), if the definition was found. */
  grantedTools?: string[];
  /** Enforcement blocks where THIS agent tried to edit a file it does not own. */
  outOfLaneBlocks?: number;
  /** Representative out-of-lane files (for evidence). */
  outOfLaneFiles?: string[];
}

function avg(nums: number[]): number {
  return nums.length ? nums.reduce((s, n) => s + n, 0) / nums.length : 0;
}

/** Rolls per-invocation profiles up into one profile per agentType. */
export function aggregate(invocations: readonly InvocationProfile[]): AgentProfile[] {
  const byType = new Map<string, InvocationProfile[]>();
  for (const inv of invocations) {
    const list = byType.get(inv.agentType) ?? [];
    list.push(inv);
    byType.set(inv.agentType, list);
  }

  const profiles: AgentProfile[] = [];
  for (const [agentType, list] of byType) {
    const toolMix: Record<string, number> = {};
    const skillMix: Record<string, number> = {};
    const files = new Set<string>();
    for (const inv of list) {
      for (const [name, n] of Object.entries(inv.toolCounts)) toolMix[name] = (toolMix[name] ?? 0) + n;
      for (const [name, n] of Object.entries(inv.skillCounts)) skillMix[name] = (skillMix[name] ?? 0) + n;
      for (const f of inv.filesTouched) files.add(f);
    }

    const totalToolCalls = list.reduce((s, i) => s + i.toolCalls, 0);
    const totalToolErrors = list.reduce((s, i) => s + i.toolErrors, 0);
    const totalOutputTokens = list.reduce((s, i) => s + i.tokens.output, 0);
    const completed = list.filter((i) => i.completed).length;

    profiles.push({
      agentType,
      invocations: list.length,
      models: [...new Set(list.map((i) => i.model).filter((m): m is string => !!m))],
      totalToolCalls,
      avgToolCalls: avg(list.map((i) => i.toolCalls)),
      toolMix,
      skillMix,
      avgTurns: avg(list.map((i) => i.turns)),
      totalOutputTokens,
      avgOutputTokens: avg(list.map((i) => i.tokens.output)),
      avgTotalTokens: avg(list.map((i) => i.tokens.total)),
      avgSpanMs: avg(list.map((i) => i.spanMs)),
      maxSpanMs: Math.max(0, ...list.map((i) => i.spanMs)),
      toolErrorRate: totalToolCalls ? totalToolErrors / totalToolCalls : 0,
      incompleteRate: list.length ? 1 - completed / list.length : 0,
      distinctFiles: files.size,
      maxFileEdits: Math.max(0, ...list.map((i) => i.maxFileEdits)),
      attention: 0,
    });
  }
  return profiles;
}

/** Factual composite (errors + incompletes + verbosity) used only to sort the roster. */
export function attentionScore(p: AgentProfile): number {
  return p.toolErrorRate * 20 + p.incompleteRate * 20 + Math.min(10, p.avgTurns / 6);
}

/** Aggregates and sorts profiles, noisiest first. */
export function analyze(invocations: readonly InvocationProfile[]): AgentProfile[] {
  const profiles = aggregate(invocations);
  for (const p of profiles) p.attention = attentionScore(p);
  return profiles.sort((a, b) => b.attention - a.attention);
}

// =============================================================================
// Pure context helpers (evidence for the LLM analysis)
// =============================================================================

/** Parses the `tools:` value from an agent .md frontmatter (list or CSV form). */
export function parseGrantedTools(agentMd: string): string[] {
  const fm = agentMd.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fm?.[1]) return [];
  const block = fm[1];

  // Inline CSV form: `tools: Read, Edit, Bash`
  const inline = block.match(/^tools:[ \t]*([^\n]+)$/m);
  if (inline?.[1] && inline[1].trim() && !inline[1].trim().startsWith('#')) {
    return inline[1].split(',').map((t) => t.trim()).filter(Boolean);
  }

  // YAML list form:
  //   tools:
  //     - Read
  //     - Edit
  const listStart = block.match(/^tools:[ \t]*$/m);
  if (listStart) {
    const after = block.slice((listStart.index ?? 0) + listStart[0].length);
    const items: string[] = [];
    for (const line of after.split('\n').slice(1)) {
      const item = line.match(/^[ \t]+-[ \t]*(.+)$/);
      if (item?.[1]) items.push(item[1].trim());
      else if (line.trim() && !/^[ \t]/.test(line)) break; // next top-level key
    }
    return items;
  }
  return [];
}

/**
 * Scans grimoire-router.log NDJSON for out-of-lane enforcement blocks per agent.
 * A block whose `agent_type` is set means that sub-agent tried to edit a file it
 * does not own (the owners are in `blocking_agents`).
 */
export function enforceContextFromLog(logText: string): Record<string, AgentContext> {
  const ctx: Record<string, AgentContext> = {};
  for (const line of logText.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let e: Record<string, unknown>;
    try {
      e = JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      continue;
    }
    if (e['enforce_block'] !== true) continue;
    const agentType = typeof e['agent_type'] === 'string' ? e['agent_type'] : null;
    if (!agentType) continue; // null agent_type = main thread, not a sub-agent
    const bucket = (ctx[agentType] ??= { outOfLaneBlocks: 0, outOfLaneFiles: [] });
    bucket.outOfLaneBlocks = (bucket.outOfLaneBlocks ?? 0) + 1;
    const file = typeof e['file_basename'] === 'string' ? e['file_basename'] : null;
    if (file && bucket.outOfLaneFiles && !bucket.outOfLaneFiles.includes(file)) {
      bucket.outOfLaneFiles.push(file);
    }
  }
  return ctx;
}
