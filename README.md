# Grimoire

A collection of specialized agents and skills for [Claude Code](https://docs.anthropic.com/en/docs/claude-code).

Extend Claude Code with domain-specific expertise, automated workflows, and reusable development patterns. Includes ready-to-use agents for code review, .NET development, and content verification, plus skills for TypeScript, git commits, and documentation.

[![CI](https://github.com/anton-kochev/claudify/actions/workflows/ci.yml/badge.svg)](https://github.com/anton-kochev/claudify/actions/workflows/ci.yml)

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [CLI](#cli)
  - [List](#list)
  - [Remove](#remove)
  - [Update](#update)
  - [Log Viewer](#log-viewer)
- [Skill Router](#skill-router)
- [Agents](#agents)
  - [dotnet-architect](#dotnet-architect)
  - [csharp-coder](#csharp-coder)
  - [dotnet-unit-test-writer](#dotnet-unit-test-writer)
  - [csharp-code-reviewer](#csharp-code-reviewer)
  - [code-reviewer](#code-reviewer)
  - [tdd-specialist](#tdd-specialist)
  - [fact-checker](#fact-checker)
  - [typescript-coder](#typescript-coder)
  - [vue3-coder](#vue3-coder)
- [Skills](#skills)
  - [dotnet-unit-testing](#dotnet-unit-testing)
  - [dotnet-feature-workflow](#dotnet-feature-workflow)
  - [conventional-commit](#conventional-commit)
  - [context-file-guide](#context-file-guide)
  - [skill-developer](#skill-developer)
  - [readme-guide](#readme-guide)
  - [grimoire.business-logic-docs](#grimoirebusiness-logic-docs)
  - [grimoire.tdd-specialist](#grimoiretdd-specialist)
  - [grimoire.modern-typescript](#grimoiremodern-typescript)
- [Creating New Skills](#creating-new-skills)
- [Project Structure](#project-structure)
- [Contributing](#contributing)
- [License](#license)

## Features

- **CLI Tool** - Install, list, update, and remove agents and skills with `grimoire add/list/update/remove`, view logs with `grimoire logs`
- **Pre-built Agents** - Domain experts for .NET architecture, unit testing, TDD, code review, and fact verification
- **Reusable Skills** - Workflows for conventional commits, README generation, and skill development
- **Validation Tooling** - Scripts to ensure skills meet Anthropic's requirements
- **Templates & Examples** - Scaffolding for creating your own agents and skills
- **Best Practices Documentation** - Comprehensive guides for quality skill development

## Installation

### Using the CLI (Recommended)

Install agents and skills from npm packs using the `grimoire` CLI:

```bash
# For JS/TS projects — install as a dev dependency
pnpm add -D @grimoire-cc/cli
grimoire add    # interactive wizard

# For non-JS projects — run on demand
npx -p @grimoire-cc/cli grimoire add
```

See the [CLI](#cli) section for full usage details.

### Manual Installation

#### Skills

Copy a skill directory to your project's `.claude/skills/` folder:

```bash
cp -r .claude/skills/grimoire.conventional-commit /path/to/your/project/.claude/skills/
```

#### Agents

Copy agent markdown files from `.claude/agents/` to your project and reference them in your `.claude/settings.json`.

### Agent Enforcement (Optional)

Grimoire can use router hooks to enforce agent ownership of files. Enable it with `grimoire config` after installing agents with `file_patterns`.

## CLI

The `grimoire` CLI installs agents and skills from npm packs into your project's `.claude/` directory.

### Usage

```bash
# Launch the interactive installer wizard
grimoire add
```

The wizard lets you select individual agents and skills from all available packs. All items are pre-selected by default.

### List

```bash
# Show all grimoire-managed agents and skills in the current project
grimoire list
```

Only items tracked in `grimoire.json` (installed by `grimoire add`) are shown. Agents and skills you created manually are not listed.

Selecting an item opens a detail view with description, model, assigned skills, and enforcement paths. From there you can:

- **Remove** — delete the item and clean up its manifest entry
- **Update** — apply a newer version from the installed pack
- **Manage skills** (agents only) — add or remove skill assignments
- **Manage paths** (agents only) — add or remove enforcement file patterns (e.g. `*.ts`, `*.cs`)

### Remove

```bash
# Interactively remove grimoire-managed agents and skills
grimoire remove
```

Presents a checklist of items installed by grimoire. Selecting an item removes its files from `.claude/` and cleans up its entry in `grimoire.json`. Manually created items are never shown, so they cannot be accidentally removed.

### Update

```bash
# Check for and apply updates to installed agents and skills
grimoire update
```

Compares installed item versions against the bundled pack versions and presents a selection of outdated items to update. Only grimoire-managed items are checked.

### Log Viewer

```bash
# Open the skill-router log viewer in your browser
grimoire logs

# Use a custom log file
grimoire logs --file path/to/custom.log

# Specify a port
grimoire logs --port 3000
```

Starts a local server and opens an interactive dashboard with stats, filters, and a sortable table for analyzing skill-router activation history. The viewer streams new entries in real-time via SSE — a green "LIVE" badge indicates active streaming. Press `Ctrl+C` to stop.

### What `add` does

- Discovers all bundled packs and presents an interactive wizard
- Copies agent `.md` files to `.claude/agents/`
- Copies skill directories to `.claude/skills/`
- Registers installed items and agent enforcement metadata in `.claude/grimoire.json`
- Overwrites existing files with a warning if conflicts exist
- Creates `.claude/agents/` and `.claude/skills/` directories if they don't exist

### Pack Manifest

Each pack includes a `grimoire.json` manifest describing its contents:

```json
{
  "name": "@grimoire-cc/dotnet-pack",
  "version": "1.0.0",
  "agents": [
    {
      "name": "csharp-reviewer",
      "path": "agents/csharp-reviewer.md",
      "description": "Expert C#/.NET code review specialist"
    }
  ],
  "skills": [
    {
      "name": "dotnet-unit-testing",
      "path": "skills/dotnet-unit-testing/",
      "description": "Expert .NET unit testing specialist"
    }
  ]
}
```

Skills are installed as Claude Code skill directories. Automatic skill matching is not configured by Grimoire.

## Router and Agent Enforcement

The router supports agent enforcement and subagent skill injection. Automatic skill matching has been removed.

### Agent Enforcement (PreToolUse)

When enforcement is enabled, the router blocks direct edits to files owned by agents through `file_patterns`. This nudges work through the appropriate specialist agent while leaving unrelated files untouched.

Enable or disable enforcement with:

```bash
grimoire config
```

### Subagent Skill Injection

Agents can declare skill assignments in their frontmatter with a `skills:` array. Router subagent hooks inject those skill instructions when the agent starts; this is explicit agent configuration, not automatic matching.

### Configuration

Installed skills and agent mappings are tracked in `.claude/grimoire.json` under the `router` key:

```json
{
  "version": "2.0.0",
  "config": {},
  "skills": [
    {
      "path": ".claude/skills/my-skill",
      "name": "My Skill",
      "description": "Skill description"
    }
  ],
  "agents": {
    "grimoire.csharp-coder": {
      "file_patterns": ["*.cs"]
    }
  }
}
```

### Agent Configuration

| Field | Description |
|-------|-------------|
| `file_patterns` | Glob patterns for enforcement delegation |

> **Note:** Agent skill assignments are managed via frontmatter (`skills:` array in the agent `.md` file), not the manifest. Use `grimoire list → Manage skills` to manage them. Enforcement paths are managed via `grimoire list → Manage paths`.

### Hook Registration

Enforcement hooks are managed by `grimoire config`. They use `PreToolUse` with the `--enforce` flag:

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

View enforcement history with the interactive real-time dashboard:

```bash
grimoire logs
```

New entries stream live via SSE as enforcement hooks run. Or inspect raw log entries:

```bash
tail -20 .claude/logs/grimoire-router.log | jq .
```

## Agents

All agents are located in `.claude/agents/`.

### dotnet-architect

Expert guidance for .NET application architecture following modern best practices.

**Expertise:**

- Clean Architecture and Domain-Driven Design (DDD)
- Test-Driven Development (TDD)
- .NET 8+ and C# 12 features
- Entity Framework Core patterns
- SOLID principles and dependency injection

**When to use:** Designing new .NET services, reviewing architecture decisions, implementing domain models.

### csharp-coder

Implements C# code based on architectural decisions and specifications.

**Capabilities:**

- Translates designs into clean, production-ready code
- Follows SOLID principles and .NET conventions
- Repository patterns, services, controllers
- Proper validation and error handling

**When to use:** When you have a design/plan and need implementation.

### dotnet-unit-test-writer

Specialized agent for writing comprehensive unit tests in .NET projects.

**Frameworks:** xUnit (default), TUnit (for .NET 8+), Moq, NSubstitute

**Capabilities:**

- AAA (Arrange-Act-Assert) pattern implementation
- Async testing patterns
- `FakeLogger<T>` for logging verification
- Edge case and boundary testing

**When to use:** Writing new test suites, adding test coverage, TDD workflows.

### csharp-code-reviewer

Expert C#/.NET code review specialist.

**Capabilities:**

- Code quality, security, and performance review
- Best practices validation
- SOLID principles compliance
- .NET-specific patterns and anti-patterns

**When to use:** After writing or modifying C# code, before merging PRs.

### code-reviewer

Language-agnostic code review specialist that works with any programming language.

**Capabilities:**

- Detects language from file extensions and applies idiomatic conventions
- Security, performance, correctness, and maintainability review
- Deterministic quality rating system (0-10 scale)
- Severity-based checklist (Critical, High, Medium, Low)

**When to use:** After writing or modifying code in any language, before merging PRs.

### tdd-specialist

Language-agnostic TDD and unit testing specialist that works with any programming language.

**Capabilities:**

- Auto-detects project language and test framework
- Supports pytest, jest, vitest, mocha, JUnit, go test, cargo test, xUnit, RSpec, and more
- 4-step workflow: Analyze, Plan (with approval gate), Write, Explain
- Loads the [grimoire.tdd-specialist](#grimoiretdd-specialist) skill for TDD knowledge base

**When to use:** Writing unit tests, adding test coverage, TDD workflows in any language.

**Install via:** `grimoire add` and select `dev-pack`

### fact-checker

Verifies accuracy of written content before publishing.

**Capabilities:**

- Extract and categorize factual claims
- Cross-reference with authoritative sources
- Rate accuracy with confidence levels

**When to use:** Reviewing blog posts, documentation, or content with verifiable claims.

### typescript-coder

Expert TypeScript developer for writing, refactoring, debugging, and reviewing TypeScript code across any environment.

**Capabilities:**

- Type-safe code under `strict: true` with no `any`
- Result types and discriminated unions for error modeling
- Utility types, generics, and advanced type transformations
- Framework-specific TypeScript (Angular, React, Vue, Node.js, Svelte)

**When to use:** Writing or reviewing TypeScript code, designing type-safe data models, refactoring JavaScript to TypeScript.

**Install via:** `grimoire add` and select `ts-pack`

### vue3-coder

Senior Vue 3 developer for scaffolding, reviewing, and debugging Vue 3 applications.

**Capabilities:**

- Composition API with `<script setup>` and full TypeScript integration
- Pinia stores (Setup Store syntax), Vue Router 4, VueUse composables
- Typed props, emits, and `defineModel()` with no Options API
- Performance optimization, reactivity debugging, lazy-loaded routes

**When to use:** Building Vue 3 components, composables, Pinia stores, or diagnosing reactivity issues.

**Install via:** `grimoire add` and select `frontend-pack`

## Skills

All skills are located in `.claude/skills/`.

### dotnet-unit-testing

Expert .NET unit testing patterns and best practices for C#/.NET projects.

**Trigger:** When writing unit tests, TDD workflows, or working with xUnit/TUnit/Moq

**Frameworks:** xUnit (default), TUnit (recommended for .NET 8+), Moq, NSubstitute

**Includes:**

- Framework selection guide and decision flowchart
- Core principles (AAA pattern, naming, isolation, async testing)
- Parameterized testing patterns (InlineData, MemberData, Matrix)
- Test organization (nested classes, traits, collections)

**Reference files:** `framework-guidelines.md`, `parameterized-testing.md`, `test-organization.md`, `test-performance.md`, `anti-patterns.md`

**Install via:** `grimoire add` and select `dotnet-pack`

### dotnet-feature-workflow

Orchestrates end-to-end .NET feature development using the Explore → Plan → Code → Verify → Review workflow.

**Trigger:** "build feature", "implement feature", "create feature"

**Capabilities:**

- Spawns specialized agents at each phase
- TDD with tests written before implementation
- User approval gates between phases
- Automated code review before completion

**When to use:** Building complete features with quality gates and minimal hand-holding.

**Install via:** `grimoire add` and select `dotnet-pack`

### conventional-commit

Generates git commits following the [Conventional Commits 1.0.0](https://www.conventionalcommits.org/) specification.

**Trigger:** `/commit`

**Commit Types:**

| Type | Description |
| ------ | ------------- |
| `feat` | New features |
| `fix` | Bug fixes |
| `docs` | Documentation changes |
| `refactor` | Code refactoring |
| `test` | Test additions/changes |
| `perf` | Performance improvements |
| `chore` | Maintenance tasks |

### context-file-guide

Best practices for writing CLAUDE.md project context files.

**Trigger:** When creating, reviewing, or improving CLAUDE.md files

**Includes:**

- Battle-tested structure template
- Section guidelines (Tech Stack, Commands, Conventions, Architecture, Workflow)
- Advanced context management with `@` imports
- `validate-context-file.sh` - Enforces 100-line limit

### skill-developer

Meta-skill for creating and maintaining Claude Code skills.

**Trigger:** When creating or updating skills

**Includes:**

- `create-skill.sh` - Scaffolding script for new skills
- `validate-skill.py` - Validation against Anthropic requirements
- Templates for basic and domain-specific skills
- Best practices documentation

### readme-guide

Creates professional README files following industry standards.

**Trigger:** When creating or reviewing documentation

**Based on:** Make a README, Standard Readme, Google Style Guide

**Capabilities:**

- Generate complete READMEs for any project type
- Recommend sections based on project type
- Suggest appropriate badges using Shields.io
- Review existing READMEs against best practices

### grimoire.business-logic-docs

Guides Claude through creating, updating, and auditing a structured knowledge base of a project's business logic.

**Trigger:** When documenting business rules, domain knowledge, invariants, workflows, or reviewing docs for staleness

**Capabilities:**

- Discover domain areas from codebase structure and interview developers
- Generate three-tier documentation: overview, per-domain-area files, decision log
- Update existing docs from user stories, change requests, or discussion summaries (5-step structured workflow)
- Audit knowledge base for staleness, terminology inconsistencies, and documentation gaps
- Integrate with CLAUDE.md for automatic context loading

**Output:** Markdown files in `docs/business-logic/` with glossary, business rules, constraints, state diagrams, decision trees, and decision log.

**Reference files:** `tier2-template.md`, `audit-checklist.md`

### grimoire.tdd-specialist

Language-agnostic TDD and unit testing patterns for any programming language.

**Trigger:** When writing unit tests, TDD workflows, or working with any test framework

**Frameworks:** pytest, Vitest, Jest, Mocha, JUnit 5, Go testing, Rust #[test], xUnit, RSpec

**Includes:**

- Language and framework auto-detection
- Universal testing principles (AAA pattern, naming, isolation, mocking)
- 4-step workflow with mandatory approval gate
- Anti-patterns guide (The Liar, The Giant, Excessive Setup, and more)
- TDD workflow patterns (Red-Green-Refactor, Transformation Priority Premise)

**Reference files:** `language-frameworks.md`, `anti-patterns.md`, `tdd-workflow-patterns.md`

**Install via:** `grimoire add` and select `dev-pack`

### grimoire.modern-typescript

Modern TypeScript best practices, patterns, and type system mastery for TS 5.7+.

**Trigger:** When writing TypeScript, reviewing TS code, designing types, or configuring tsconfig

**Includes:**

- Core principles: strict mode, `satisfies`, branded types, discriminated unions
- Strict `tsconfig.json` configuration with key flags explained
- Error handling with Result types and type-safe narrowing
- Module patterns, anti-patterns table, annotation guidelines

**Reference files:** `type-system.md`, `patterns-and-idioms.md`, `modern-features.md`

**Install via:** `grimoire add` and select `ts-pack`

## Creating New Skills

### Quick Start

```bash
# Create a new skill from template
.claude/skills/grimoire.skill-developer/scripts/create-skill.sh my-new-skill

# Validate your skill
python3 .claude/skills/grimoire.skill-developer/scripts/validate-skill.py .claude/skills/my-new-skill
```

### Requirements

Skills must meet Anthropic's requirements:

| Requirement | Limit |
| ------------- | ------- |
| SKILL.md body | 500 lines max |
| Total bundle size | 8 MB max |
| Skills per request | 8 max |
| Reference file nesting | 1 level deep |

### YAML Frontmatter

Every SKILL.md requires valid frontmatter:

```yaml
---
name: my-skill-name
description: "What it does and when to use it"
---
```

**Name requirements:**

- Lowercase letters, numbers, and hyphens only
- Maximum 64 characters
- Cannot start/end with hyphen
- Cannot contain "anthropic" or "claude"

### Documentation

| Document | Purpose |
| ---------- | --------- |
| [best-practices.md](.claude/skills/grimoire.skill-developer/reference/best-practices.md) | Content quality and organization |
| [patterns.md](.claude/skills/grimoire.skill-developer/reference/patterns.md) | Common skill patterns |
| [file-organization.md](.claude/skills/grimoire.skill-developer/reference/file-organization.md) | Directory structure |
| [yaml-spec.md](.claude/skills/grimoire.skill-developer/reference/yaml-spec.md) | Frontmatter requirements |

### Templates

| Template | Use Case |
| ---------- | ---------- |
| [basic-skill.md](.claude/skills/grimoire.skill-developer/templates/basic-skill.md) | Single-purpose skills |
| [domain-skill.md](.claude/skills/grimoire.skill-developer/templates/domain-skill.md) | Specialized expertise |

### Examples

| Example | Pattern |
| --------- | --------- |
| [financial-analysis.md](.claude/skills/grimoire.skill-developer/examples/financial-analysis.md) | Structured data processing |
| [brand-guidelines.md](.claude/skills/grimoire.skill-developer/examples/brand-guidelines.md) | Standards enforcement |

## Project Structure

```plain
grimoire/
├── README.md
├── CLAUDE.md                          # Project context for Claude Code
├── package.json                       # pnpm workspace root
├── packages/
│   ├── cli/                           # grimoire CLI tool
│   │   ├── src/                       # TypeScript source
│   │   └── tests/                     # Vitest tests
│   └── skill-router/                  # Auto-activation hook
│       ├── src/                       # TypeScript source
│       └── tests/                     # Vitest tests
└── .claude/
    ├── settings.json                  # Hook registration
    ├── grimoire.json                  # Unified config (settings + router)
    ├── hooks/
    │   └── skill-router.ts            # Hook entry point
    ├── agents/
    │   ├── grimoire.dotnet-architect.md
    │   ├── grimoire.csharp-coder.md
    │   ├── grimoire.dotnet-unit-test-writer.md
    │   ├── grimoire.csharp-code-reviewer.md
    │   ├── grimoire.code-reviewer.md
    │   ├── grimoire.tdd-specialist.md
    │   ├── grimoire.fact-checker.md
    │   ├── grimoire.typescript-coder.md
    │   └── grimoire.vue3-coder.md
    └── skills/
        ├── grimoire.dotnet-unit-testing/
        │   ├── SKILL.md
        │   ├── reference/
        │   └── templates/
        ├── grimoire.dotnet-feature-workflow/
        │   └── SKILL.md
        ├── grimoire.conventional-commit/
        │   └── SKILL.md
        ├── grimoire.context-file-guide/
        │   ├── SKILL.md
        │   └── scripts/
        ├── grimoire.skill-developer/
        │   ├── SKILL.md
        │   ├── scripts/
        │   ├── templates/
        │   ├── examples/
        │   └── reference/
        ├── grimoire.readme-guide/
        │   └── SKILL.md
        ├── grimoire.tdd-specialist/
        │   ├── SKILL.md
        │   └── reference/
        │       ├── language-frameworks.md
        │       ├── anti-patterns.md
        │       └── tdd-workflow-patterns.md
        ├── grimoire.business-logic-docs/
        │   ├── SKILL.md
        │   └── references/
        │       ├── tier2-template.md
        │       └── audit-checklist.md
        └── grimoire.modern-typescript/
            ├── SKILL.md
            └── reference/
                ├── type-system.md
                ├── patterns-and-idioms.md
                └── modern-features.md
```

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

   # Run skill-router tests
   pnpm --filter @grimoire-cc/skill-router test

   # Validate any new skills
   python3 .claude/skills/grimoire.skill-developer/scripts/validate-skill.py .claude/skills/your-skill
   ```

5. Submit a pull request

### Guidelines

- Follow existing naming conventions
- Include comprehensive documentation
- Add examples where appropriate
- Ensure validation passes for all skills

## License

MIT
