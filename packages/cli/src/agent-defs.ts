/**
 * Local agent definition lookup.
 *
 * An agent type is worth tracking only if its definition can be edited —
 * i.e. an `<agentType>.md` exists in the project's `.claude/agents/` or the
 * user-level `~/.claude/agents/`. Claude Code's built-in agents (Explore,
 * Plan, general-purpose, …) have no such file, so insights about them are
 * noise: there is nothing to act on.
 */

import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

function defaultUserAgentsDir(): string {
  return join(homedir(), '.claude', 'agents');
}

/** Names of agents with an editable local definition (project + user level). Never throws. */
export function listDefinedAgentTypes(cwd: string, userAgentsDir = defaultUserAgentsDir()): Set<string> {
  const names = new Set<string>();
  for (const dir of [resolve(cwd, '.claude', 'agents'), userAgentsDir]) {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      continue; // missing/unreadable dir → contributes nothing
    }
    for (const f of entries) {
      if (f.endsWith('.md')) names.add(f.slice(0, -'.md'.length));
    }
  }
  return names;
}

/** Resolves the definition file path for one agent (project dir wins), or null. */
export function resolveAgentDefPath(
  cwd: string,
  agentType: string,
  userAgentsDir = defaultUserAgentsDir(),
): string | null {
  for (const dir of [resolve(cwd, '.claude', 'agents'), userAgentsDir]) {
    const p = join(dir, `${agentType}.md`);
    if (existsSync(p)) return p;
  }
  return null;
}
