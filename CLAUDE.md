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
- Agents: Single .md files in `.claude/agents/` with persona, tools, model in frontmatter
- Skills: Directories in `.claude/skills/<name>/` with SKILL.md + supporting files
- CLI: `packages/cli/` - installs agents/skills from npm packs into projects
  - `grimoire add` launches interactive wizard (pack selection → item selection → auto-activation)
  - `grimoire enforce-agent` toggles per-agent enforcement (delegates file edits to agents)
  - `grimoire logs` opens real-time log viewer in browser (`--file`, `--port`)
- Router: `packages/router/` - hook runtime for skill auto-activation and agent enforcement
  - UserPromptSubmit: Matches skills to user prompts (keywords: exact, stem, fuzzy)
  - PreToolUse: Injects skill context before Edit/Write tools; blocks if enforce active
- Config: `.claude/skills-manifest.json` defines skill triggers, weights, and agent mappings

## Code Conventions
- Skills use progressive disclosure (supporting files load on-demand)
- Agent descriptions include usage examples
- Skill descriptions contain trigger keywords for automatic activation
- SKILL.md max 500 lines; CLAUDE.md max 100 lines

## Skill Authoring
- Frontmatter: `name` (lowercase+hyphens, max 64 chars) + `description` (max 1024 chars)
- Reference files >100 lines require table of contents
- Total bundle max 8 MB; max 8 skills per request

## Publishing
- CLI: git tag `cli/vX.Y.Z` (e.g. `cli/v0.3.0`)
- Router: git tag `router/vX.Y.Z` (e.g. `router/v1.0.0`)
- Any other tag format will not trigger the npm publish workflow

## Workflow
- Run tests before committing: `pnpm test`
- Follow conventional commits
- Check logs: `grimoire logs` or `tail -20 .claude/logs/grimoire-router.log | jq .`
