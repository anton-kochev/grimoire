# Grimoire

A collection of specialized agents and skills for [Claude Code](https://docs.anthropic.com/en/docs/claude-code).

Extend Claude Code with domain-specific agents, reusable skills, and agent enforcement that routes edits of owned files through the right specialist — coders, reviewers, and architects for .NET, TypeScript, Angular, Vue, and Rust, plus skills for testing, git commits, requirements, documentation, and content.

[![CI](https://github.com/anton-kochev/grimoire/actions/workflows/ci.yml/badge.svg)](https://github.com/anton-kochev/grimoire/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/%40grimoire-cc%2Fcli.svg)](https://www.npmjs.com/package/@grimoire-cc/cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [CLI](#cli)
  - [Add](#add)
  - [List](#list)
  - [Remove](#remove)
  - [Update](#update)
  - [Config](#config)
  - [Agent Skills](#agent-skills)
  - [Agent Insights & Logs](#agent-insights--logs)
  - [Pack Manifest](#pack-manifest)
- [Router and Agent Enforcement](#router-and-agent-enforcement)
- [Packs](#packs)
- [Agents](#agents)
  - [Coder Variants](#coder-variants-experimental)
- [Skills](#skills)
- [Creating New Skills](#creating-new-skills)
- [Project Structure](#project-structure)
- [Contributing](#contributing)
- [License](#license)

## Features

- **CLI tool** — install, list, update, and remove agents and skills with `grimoire add/list/update/remove`; inspect sub-agent behavior and enforcement logs with `grimoire logs`
- **Pre-built agents** — coders, reviewers, architects, and test writers for .NET, TypeScript, Angular, Vue, and Rust, plus language-agnostic review/TDD and content verification
- **Reusable skills** — language and framework best-practice guides (modern C#, ASP.NET Core APIs, modern TypeScript), testing playbooks for six languages, conventional commits, SRS/user-story generation, business-logic docs, README and skill authoring, translation, and content craft
- **Agent enforcement** — optional router hooks that keep edits to owned files flowing through the right specialist agent
- **Validation tooling** — scripts to ensure skills meet Anthropic's requirements
- **Templates & examples** — scaffolding for creating your own agents and skills

## Installation

### Using the CLI (recommended)

Install agents and skills from npm packs using the `grimoire` CLI:

```bash
# For JS/TS projects — install as a dev dependency
pnpm add -D @grimoire-cc/cli
pnpm exec grimoire add    # interactive wizard

# For non-JS projects — run on demand
npx -p @grimoire-cc/cli grimoire add
```

See the [CLI](#cli) section for full usage details.

### Manual installation

#### Skills

Copy a skill directory into your project's `.claude/skills/` folder:

```bash
cp -r packages/cli/packs/dev-pack/skills/grimoire.conventional-commit /path/to/your/project/.claude/skills/
```

#### Agents

Copy an agent markdown file from a pack's `agents/` directory into your project's `.claude/agents/`.

## CLI

The `grimoire` CLI installs agents and skills from bundled npm packs into your project's `.claude/` directory and tracks them in `.claude/grimoire.json`.

### Add

```bash
# Launch the interactive installer wizard
grimoire add
```

The wizard walks pack selection → item selection. It:

- Discovers all bundled packs and presents an interactive wizard (items pre-selected by default)
- Copies agent `.md` files to `.claude/agents/` and skill directories to `.claude/skills/`
- Registers installed items and enforcement metadata in `.claude/grimoire.json`
- Creates `.claude/agents/` and `.claude/skills/` if they don't exist, overwriting conflicts with a warning

### List

```bash
# Show all grimoire-managed agents and skills in the current project
grimoire list
```

Only items tracked in `grimoire.json` (installed by `grimoire add`) are shown — agents and skills you created manually are never listed. `list` is the unified management hub: selecting an item opens a detail view with description, model, assigned skills, and enforcement paths, from which you can:

- **Remove** — delete the item and clean up its manifest entry
- **Update** — apply a newer version from the installed pack
- **Manage skills** (agents only) — add or remove skill assignments
- **Manage paths** (agents only) — add or remove enforcement file patterns (e.g. `*.ts`, `*.cs`)

### Remove

```bash
# Interactively remove grimoire-managed agents and skills
grimoire remove
```

Presents a checklist of grimoire-installed items, removes the selected files from `.claude/`, and cleans up their entries in `grimoire.json`. Manually created items are never shown, so they can't be removed by accident.

### Update

```bash
# Check for and apply updates to installed agents and skills
grimoire update
```

Compares each installed item's version against the bundled pack version and offers to update the outdated ones. Only grimoire-managed items are checked.

### Config

```bash
# Toggle global settings (e.g. agent enforcement)
grimoire config
```

### Agent Skills

```bash
# Manage the skills assigned to an agent
grimoire agent-skills
```

Adds or removes skills in an agent's frontmatter `skills:` array. Claude Code natively injects the full content of assigned skills into the subagent's context at startup.

### Agent Insights & Logs

```bash
# Open the Agent Insights viewer in your browser
grimoire logs

# Use a custom log file, port, or transcript directory
grimoire logs --file path/to/custom.log
grimoire logs --port 3000
grimoire logs --transcripts path/to/project-transcripts
```

Starts a local server and opens an interactive dashboard with two tabs:

- **Insights** — reconstructs each sub-agent's real behavior from its Claude Code transcripts: runs, turns, tool mix, files touched, errors, and outcomes. From an agent's detail view you can request an on-demand **AI review** that reasons over the recorded runs (via your local `claude` CLI; each review spends tokens) and suggests concrete prompt/tools/skills improvements.
- **Events** — the router enforcement log with stats, filters, and a sortable table. New entries stream in real time via SSE — a green "LIVE" badge indicates active streaming.

Press `Ctrl+C` to stop.

### Pack Manifest

Each pack includes a `grimoire.json` manifest describing its contents:

```json
{
  "name": "dotnet-pack",
  "version": "1.0.0",
  "agents": [
    {
      "name": "grimoire.csharp-code-reviewer",
      "path": "agents/grimoire.csharp-code-reviewer.md",
      "description": "Expert C#/.NET code review specialist.",
      "version": "1.1.0"
    }
  ],
  "skills": [
    {
      "name": "grimoire.unit-testing-dotnet",
      "path": "skills/grimoire.unit-testing-dotnet",
      "description": "C#/.NET unit testing specialist.",
      "version": "1.0.0"
    }
  ]
}
```

Each item carries its own `version`; `grimoire update` compares these to detect updates.

## Router and Agent Enforcement

The router (`@grimoire-cc/router`) is a hook runtime for agent enforcement. Automatic skill matching is handled natively by Claude Code, not the router.

### Agent enforcement (PreToolUse)

When enforcement is enabled, the router blocks direct edits to files owned by agents through `file_patterns`. This nudges work through the appropriate specialist agent while leaving unrelated files untouched. Ownership is resolved statelessly from the PreToolUse `agent_type` field: a specialist may edit the files it owns, while the main thread and non-owner agents are blocked. SubagentStart/Stop hooks emit lifecycle telemetry only.

Enable or disable enforcement with:

```bash
grimoire config
```

### Subagent skills

Agents declare skill assignments in their frontmatter with a `skills:` array (managed with `grimoire agent-skills`). Claude Code natively injects the full content of those skills into the subagent's context at startup — no router hooks involved.

### Configuration

Settings and router config live in `.claude/grimoire.json`. Enforcement paths are stored per agent under the `router` key:

```json
{
  "router": {
    "agents": {
      "grimoire.csharp-coder": {
        "file_patterns": ["*.cs"]
      }
    }
  }
}
```

| Field | Description |
|-------|-------------|
| `file_patterns` | Glob patterns for enforcement delegation |

> **Note:** Agent skill assignments are managed via frontmatter (`skills:` array in the agent `.md` file), not the manifest. Use `grimoire list → Manage skills` to manage them, and `grimoire list → Manage paths` for enforcement paths.

### Hook registration

Enforcement hooks are managed by `grimoire config` and written to the local (gitignored) `.claude/settings.local.json`. They use `PreToolUse` with the `--enforce` flag:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Edit|Write|MultiEdit",
        "hooks": [{
          "type": "command",
          "command": "npx @grimoire-cc/router --enforce"
        }]
      }
    ]
  }
}
```

### Logs

View enforcement history with the real-time dashboard (`grimoire logs`) or inspect raw entries:

```bash
tail -20 .claude/logs/grimoire-router.log | jq .
```

## Packs

Grimoire ships ten packs. Install any subset with `grimoire add`.

| Pack | Contents |
|------|----------|
| `dev-pack` | Language-agnostic code review and TDD — agents plus shared review/TDD skills |
| `dotnet-pack` | C#/.NET architect, coder, test writer, and reviewer agents, plus skills for modern C#, ASP.NET Core APIs, XML docs, testing, and the feature workflow |
| `ts-pack` | TypeScript coder plus modern-TypeScript and TS testing skills |
| `frontend-pack` | Angular and Vue 3 coders |
| `rust-pack` | Rust architect, coder, and Rust testing skill |
| `go-pack` | Go unit testing skill |
| `python-pack` | Python unit testing skill |
| `essentials-pack` | Content crafting, fact checking, SRS/user-story generation, translation |
| `docs-pack` | Business-logic documentation skill |
| `meta-pack` | Authoring tools — skill developer, README guide, context-file guide |

## Agents

Agents are installed into `.claude/agents/`. Each is a single markdown file with a persona, tool list, optional skill assignments, and model in its frontmatter.

### dev-pack

| Agent | What it does |
|-------|--------------|
| `grimoire.code-reviewer` | Language-agnostic code review — detects the language and applies idiomatic conventions, severity-ranked findings, and a deterministic quality rating. Loads the `grimoire.code-review-standards` skill. |
| `grimoire.unit-test-writer` | Language-agnostic unit-test authoring — auto-detects the test framework (pytest, Jest, Vitest, go test, cargo test, xUnit, …) and runs a 4-step analyze → plan → approve → write loop. Writes test files only, never production code. |

### dotnet-pack

| Agent | What it does |
|-------|--------------|
| `grimoire.dotnet-architect` | Designs and refactors .NET solutions with Clean Architecture, DDD, and TDD — entities, services, API endpoints, infrastructure. |
| `grimoire.csharp-coder` | Implements C# from a design or plan: clean, production-ready code following SOLID and .NET conventions. |
| `grimoire.dotnet-unit-test-writer` | Writes comprehensive .NET tests (xUnit/TUnit, Moq/NSubstitute), defaulting to xUnit and recommending TUnit for .NET 8+. |
| `grimoire.csharp-code-reviewer` | C#/.NET-only code review across quality, security, performance, and best practices. |

### ts-pack

| Agent | What it does |
|-------|--------------|
| `grimoire.typescript-coder` | Writes, refactors, debugs, and reviews TypeScript in any environment — strict types, Result/discriminated-union error modeling, advanced generics. |

### frontend-pack

| Agent | What it does |
|-------|--------------|
| `grimoire.angular-coder` | Writes and debugs Angular — components, services, directives, pipes, guards, resolvers — reading the codebase to match conventions. |
| `grimoire.vue3-coder` | Builds Vue 3 with the Composition API and `<script setup>`, Pinia, Vue Router, and reactivity debugging. |

### rust-pack

| Agent | What it does |
|-------|--------------|
| `grimoire.rust-architect` | High-level Rust architecture — module organization, trait design, ownership patterns, error-handling strategy, crate structure. |
| `grimoire.rust-coder` | Writes, edits, and debugs Rust — features, bug fixes, tests, compiler errors, lifetimes, and borrow-checker issues. |

### essentials-pack

| Agent | What it does |
|-------|--------------|
| `grimoire.content-crafter` | Writes publication-ready content — blog posts, articles, stories, podcast/YouTube scripts, screenplays, narration. Loads the `grimoire.content-craft` skill. |
| `grimoire.fact-checker` | Verifies factual claims in finished content against authoritative sources before publishing. |

### Coder Variants (experimental)

Five coders ship two extra A/B variants that differ only in how hard they push back on a conflicting instruction:

- **`-guided`** — treats explicit direction as binding: flags conflicts with best practice and recommends an alternative, but implements what was asked (refusing only genuinely harmful directions).
- **`-opinionated`** — prioritizes engineering quality: implements the best-practice approach and documents every deviation from the given direction.

Available for `csharp-coder` (dotnet-pack), `typescript-coder` (ts-pack), `angular-coder` and `vue3-coder` (frontend-pack), and `rust-coder` (rust-pack). These are versioned `0.1.0` while the approach is evaluated — the base coders remain the stable default.

## Skills

Skills are installed into `.claude/skills/`. Each is a directory with a `SKILL.md` plus optional reference, template, example, and script files loaded on demand.

### dev-pack

| Skill | Purpose |
|-------|---------|
| `grimoire.code-review-standards` | Shared review methodology — severity-prioritized criteria, a deterministic quality rating, and a standard report format. Backs the code reviewers. |
| `grimoire.tdd` | Test-first workflow — list behaviors, drive each through red-green-refactor, let the tests shape the design. Any language. |
| `grimoire.conventional-commit` | Generate git commits following [Conventional Commits 1.0.0](https://www.conventionalcommits.org/). Invoke with `/grimoire.conventional-commit`. |

### dotnet-pack

| Skill | Purpose |
|-------|---------|
| `grimoire.modern-csharp` | Performant, robust modern C# (C# 12–14, .NET 8/9/10) — nullable refs, records, pattern matching, async correctness, allocation-aware performance, and compile-time logging. |
| `grimoire.dotnet-clean-architecture` | Clean Architecture for modern .NET — the Dependency Rule, layer responsibilities, rich domain models, CQRS with or without MediatR, and when NOT to use it (vertical slice / hybrid). |
| `grimoire.dotnet-cqrs` | Tactical CQRS for .NET — the maturity ladder (handler split → read models → separate stores → event sourcing with Marten), 2025+ dispatch options beyond MediatR, outbox, idempotency, and eventual-consistency UX. |
| `grimoire.dotnet-web-api` | Microsoft's best practices for ASP.NET Core REST/HTTP APIs — minimal APIs vs controllers, validation, ProblemDetails, OpenAPI, versioning, and EF Core. |
| `grimoire.dotnet-xml-docs` | XML doc-comment conventions — the right tag per element, an intent-over-noise style, and `inheritdoc` to stay DRY. |
| `grimoire.unit-testing-dotnet` | C#/.NET testing — framework selection and patterns for xUnit, TUnit, NUnit, Moq, and NSubstitute. |
| `grimoire.dotnet-feature-workflow` | User-invoked command orchestrating Explore → Plan → Code → Verify → Review with TDD and approval gates. |

### ts-pack

| Skill | Purpose |
|-------|---------|
| `grimoire.modern-typescript` | Modern TypeScript (5.7+) — strict mode, `satisfies`, branded types, discriminated unions, Result-type error handling. |
| `grimoire.unit-testing-typescript` | TS/JS testing — patterns for Vitest, Jest, Mocha, and the Node test runner. |

### Language testing skills

| Skill | Pack | Purpose |
|-------|------|---------|
| `grimoire.unit-testing-go` | go-pack | Go testing — the `testing` stdlib, testify, gomock, and table-driven tests. |
| `grimoire.unit-testing-python` | python-pack | Python testing — pytest, unittest, hypothesis, fixtures, and parametrization. |
| `grimoire.unit-testing-rust` | rust-pack | Rust testing — the built-in framework, mockall, and proptest. |

### essentials-pack

| Skill | Purpose |
|-------|---------|
| `grimoire.content-craft` | Writing craft for long-form content — principles, per-format structure, formatting, and voice. Backs the content crafter. |
| `grimoire.srs-generator` | User-invoked command producing an ISO/IEC/IEEE 29148:2018 SRS with EARS-notation requirements and a traceability matrix. |
| `grimoire.srs-to-user-stories` | User-invoked command turning an SRS into Scrum user stories grouped under Epics. |
| `grimoire.translate-ua` | Translate prose to Ukrainian, preserving technical terms and code in English. |
| `grimoire.translate-es` | Translate prose to Spanish, preserving technical terms and code in English. |

### docs-pack

| Skill | Purpose |
|-------|---------|
| `grimoire.business-logic-docs` | Create, update, and audit a structured business-logic knowledge base — rules, invariants, workflows, state machines, decision logs. |

### meta-pack

| Skill | Purpose |
|-------|---------|
| `grimoire.skill-developer` | Create and maintain Claude Code skills following Anthropic patterns — scaffolding, validation, templates, and best practices. |
| `grimoire.readme-guide` | Create and review README files against industry best practices, with badge and section guidance. |
| `grimoire.context-file-guide` | Best practices for writing `CLAUDE.md` project context files. |

## Creating New Skills

### Quick start

```bash
# Scaffold a new skill from a template
packages/cli/packs/meta-pack/skills/grimoire.skill-developer/scripts/create-skill.sh my-new-skill

# Validate it against Anthropic's requirements
python3 packages/cli/packs/meta-pack/skills/grimoire.skill-developer/scripts/validate-skill.py path/to/my-new-skill
```

### Requirements

| Requirement | Limit |
|-------------|-------|
| SKILL.md body | 500 lines max |
| Total bundle size | 8 MB max |
| Skills per request | 8 max |
| Reference file nesting | 1 level deep |

### YAML frontmatter

Every SKILL.md requires valid frontmatter:

```yaml
---
name: my-skill-name
description: "What it does and when to use it"
---
```

**Name rules:** lowercase letters, numbers, and hyphens only; max 64 characters; cannot start or end with a hyphen; cannot contain "anthropic" or "claude".

Optional invocation fields (note the hyphens — `user_invocable` and `user-invokable` are silently ignored):

- `user-invocable: false` — hide from the `/` slash-command menu
- `disable-model-invocation: true` — stop automatic, description-based invocation (for pure slash-command skills)

### Authoring docs

| Document | Purpose |
|----------|---------|
| [best-practices.md](packages/cli/packs/meta-pack/skills/grimoire.skill-developer/reference/best-practices.md) | Content quality and organization |
| [patterns.md](packages/cli/packs/meta-pack/skills/grimoire.skill-developer/reference/patterns.md) | Common skill patterns |
| [file-organization.md](packages/cli/packs/meta-pack/skills/grimoire.skill-developer/reference/file-organization.md) | Directory structure |
| [yaml-spec.md](packages/cli/packs/meta-pack/skills/grimoire.skill-developer/reference/yaml-spec.md) | Frontmatter requirements |

## Project Structure

```plain
grimoire/
├── README.md
├── CLAUDE.md                          # Project context for Claude Code
├── package.json                       # pnpm workspace root
├── packages/
│   ├── cli/                           # grimoire CLI tool (@grimoire-cc/cli)
│   │   ├── src/                       # TypeScript source
│   │   ├── tests/                     # Vitest tests
│   │   └── packs/                     # Bundled packs (source of truth)
│   │       ├── dev-pack/
│   │       │   ├── grimoire.json      # Pack manifest
│   │       │   ├── agents/            # Agent .md files
│   │       │   └── skills/            # Skill directories
│   │       ├── dotnet-pack/
│   │       ├── ts-pack/
│   │       ├── frontend-pack/
│   │       ├── rust-pack/
│   │       ├── go-pack/
│   │       ├── python-pack/
│   │       ├── essentials-pack/
│   │       ├── docs-pack/
│   │       └── meta-pack/
│   └── router/                        # Agent-enforcement hook runtime (@grimoire-cc/router)
│       ├── src/                       # TypeScript source
│       └── tests/                     # Vitest tests
└── .claude/
    ├── settings.local.json            # Hook registration (local, gitignored)
    └── grimoire.json                  # Unified config (settings + router)
```

Agents and skills live under `packages/cli/packs/<pack>/`; that is the canonical source the CLI installs from. A project's own `.claude/agents/` and `.claude/skills/` hold the installed copies.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests and validation:

   ```bash
   # Run all tests
   pnpm test

   # Run CLI tests
   pnpm --filter @grimoire-cc/cli test

   # Run router tests
   pnpm --filter @grimoire-cc/router test

   # Validate any new skills
   python3 packages/cli/packs/meta-pack/skills/grimoire.skill-developer/scripts/validate-skill.py path/to/your-skill
   ```

5. Submit a pull request

### Guidelines

- Follow existing naming conventions (`grimoire.<name>` for agents and skills)
- Use conventional commits
- Keep SKILL.md under 500 lines and CLAUDE.md under 100 lines
- Ensure validation passes for any new skills

## License

[MIT](LICENSE)
