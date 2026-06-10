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
  - `grimoire logs` opens real-time log viewer in browser (`--file`, `--port`)
- Router: `packages/router/` - hook runtime for agent enforcement
  - PreToolUse (`--enforce`): blocks edits to files owned by agents (via file_patterns) when enforcement is enabled
  - SubagentStart/Stop (`--subagent-start`/`--subagent-stop`): session registry so subagents bypass enforcement for their own files
  - Subagent skill injection is native Claude Code behavior (`skills:` array in agent frontmatter) — not a router concern
- Config: `.claude/grimoire.json` unified config — global settings (`enforcement`, `installed`) and router config (`router` key: skill triggers, weights, agent mappings)

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
