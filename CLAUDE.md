# Project: Claudify

Collection of specialized agents and skills for Claude Code.

## Tech Stack
- Runtime: Node.js 22, TypeScript 5.7
- Package Manager: pnpm (workspace monorepo)
- Testing: Vitest
- Hook Runtime: tsx (TypeScript execution)

## Commands
- pnpm --filter claudify test: Run CLI tests
- pnpm --filter claudify test:watch: CLI watch mode
- pnpm --filter @claudify/skill-router test: Run skill-router tests
- pnpm --filter @claudify/skill-router test:watch: Watch mode
- python3 .claude/skills/skill-developer/scripts/validate-skill.py <path>: Validate skill
- .claude/skills/skill-developer/scripts/create-skill.sh <name>: Scaffold new skill

## Architecture
- Agents: Single .md files in `.claude/agents/` with persona, tools, model in frontmatter
- Skills: Directories in `.claude/skills/<name>/` with SKILL.md + supporting files
- CLI: `packages/cli/` - installs agents/skills from npm packs into projects
  - `claudify add <pack>` copies agents to `.claude/agents/`, skills to `.claude/skills/`
  - `--pick=<name>` or bare `--pick` for selective install
  - `claudify logs` opens real-time skill-router log viewer in browser (`--file`, `--port`)
- Skill Router: `packages/skill-router/` - auto-activates skills via hooks
  - UserPromptSubmit: Matches skills to user prompts (keywords: exact, stem, fuzzy)
  - SubagentStart: Injects skill instructions into agents (use `--agent=<name>` flag)
  - PreToolUse: Injects skill context before Edit/Write tools based on file path signals
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

## Workflow
- Run tests before committing: `pnpm test`
- Follow conventional commits
- Check logs: `claudify logs` or `tail -20 .claude/logs/skill-router.log | jq .`
