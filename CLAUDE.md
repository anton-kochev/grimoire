# Project: Grimoire

Collection of specialized agents and skills for Claude Code.

## Tech Stack
- Runtime: Node.js 22, TypeScript 5.7
- Package Manager: pnpm (workspace monorepo)
- Testing: Vitest
- Hook Runtime: tsx (TypeScript execution)

## Commands
- pnpm --filter @grimoire-cc/cli test: Run CLI tests
- pnpm --filter @grimoire-cc/cli test:watch: CLI watch mode
- pnpm --filter @grimoire-cc/router test: Run router tests
- pnpm --filter @grimoire-cc/router test:watch: Watch mode
- python3 .claude/skills/grimoire.skill-developer/scripts/validate-skill.py <path>: Validate skill
- .claude/skills/grimoire.skill-developer/scripts/create-skill.sh <name>: Scaffold new skill

## Architecture
- Agents: Single .md files in `.claude/agents/` with persona, tools, skills, model in frontmatter
- Skills: Directories in `.claude/skills/<name>/` with SKILL.md + supporting files
- CLI: `packages/cli/` - installs agents/skills from npm packs into projects
  - `grimoire add` launches interactive wizard (pack selection → item selection)
  - `grimoire list` unified management hub: detail view, remove, update, manage skills, manage enforcement paths
  - `grimoire remove` interactively removes grimoire-managed items (custom items are never shown)
  - `grimoire update` checks for and applies updates to grimoire-managed items
  - `grimoire config` toggles global settings (e.g. agent enforcement)
  - `grimoire agent-skills` manages skill assignments for agents (add/remove skills in frontmatter)
  - `grimoire agent-approaches` manages enforced approaches (check/uncheck from the built-in catalog in `approaches-catalog.ts`; binds the agent's matching skill; stored in `router.agents.<name>.approaches`; also via `grimoire list`)
  - `grimoire logs` opens the Agent Insights viewer (`--file`, `--port`, `--transcripts`, `--sessions`); invocation detail shows each run's chronological trace (thinking + text + tools), loaded per-run so the roster payload stays light
  - Insights merges live `~/.claude/projects` transcripts with the router's gzipped archive, deduped by run — fuller copy wins (`transcripts.ts` `loadMergedInvocations`)
- Router: `packages/router/` - hook runtime for agent enforcement + insights archiving
  - PreToolUse (`--enforce`): blocks edits to files owned by agents (via file_patterns) when enforcement is enabled
  - SubagentStart/Stop (`--subagent-start`/`--subagent-stop`): lifecycle telemetry (stateless, no registry). SubagentStart injects the enforced-approach mandate as `additionalContext` for agents with approaches (`approaches.ts`). SubagentStop runs a one-bounce adherence check (an editing run that never invoked a bound skill gets corrective feedback and continues) and archives the sub-agent transcript (gzipped) to `.claude/grimoire/sessions/<agentType>/<sessionId>/`, pruned to N-per-type; built-in agents skipped (`archive.ts`)
  - Frontmatter `skills:` (native Claude Code) makes skills *available* to a subagent — advisory only; enforced approaches are the binding layer and are independent of the `enforcement` flag
- Config: `.claude/grimoire.json` unified config — global settings (`enforcement`, `insights`, `installed`) and router config (`router.agents.<name>`: `file_patterns`, `approaches`)

## Code Conventions
- Skills use progressive disclosure (supporting files load on-demand)
- Agent descriptions include usage examples
- Skill descriptions contain trigger keywords (used by Claude Code's native skill matching)
- SKILL.md max 500 lines; CLAUDE.md max 100 lines

## Skill Authoring
- Frontmatter: `name` (lowercase+hyphens, max 64 chars) + `description` (max 1024 chars)
- Reference files >100 lines require table of contents
- Total bundle max 8 MB; max 8 skills per request

## Publishing
- CLI: git tag `cli/vX.Y.Z` (e.g. `cli/v0.3.0`)
- Router: git tag `router/vX.Y.Z` (e.g. `router/v1.0.0`)
- Any other tag format will not trigger the npm publish workflow
- Changed a skill/agent's content? Edit the pack copy under `packages/cli/packs/<pack>/` — that's the version-controlled source of truth — and bump its `version` in the pack manifest (`packages/cli/packs/<pack>/grimoire.json`), otherwise `grimoire update` never ships the fix. The `.claude/skills` and `.claude/agents` copies are local-only (gitignored); mirror changes there if you want this repo's own Claude Code to pick them up.

## Workflow
- Run tests before committing: `pnpm test`
- Follow conventional commits
- Check logs: `grimoire logs` or `tail -20 .claude/logs/grimoire-router.log | jq .`
