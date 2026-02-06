# Claudify

A collection of specialized agents and skills for [Claude Code](https://docs.anthropic.com/en/docs/claude-code).

Extend Claude Code with domain-specific expertise, automated workflows, and reusable development patterns. Includes ready-to-use agents for .NET development and content verification, plus skills for git commits and documentation.

[![CI](https://github.com/anton-kochev/claudify/actions/workflows/ci.yml/badge.svg)](https://github.com/anton-kochev/claudify/actions/workflows/ci.yml)

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [CLI](#cli)
- [Skill Router](#skill-router)
- [Agents](#agents)
  - [dotnet-architect](#dotnet-architect)
  - [csharp-coder](#csharp-coder)
  - [dotnet-unit-test-writer](#dotnet-unit-test-writer)
  - [csharp-code-reviewer](#csharp-code-reviewer)
  - [fact-checker](#fact-checker)
- [Skills](#skills)
  - [dotnet-unit-testing](#dotnet-unit-testing)
  - [dotnet-feature-workflow](#dotnet-feature-workflow)
  - [conventional-commit](#conventional-commit)
  - [context-file-guide](#context-file-guide)
  - [skill-developer](#skill-developer)
  - [readme-guide](#readme-guide)
- [Creating New Skills](#creating-new-skills)
- [Project Structure](#project-structure)
- [Contributing](#contributing)
- [License](#license)

## Features

- **CLI Tool** - Install agents and skills from npm packs with `claudify add`
- **Pre-built Agents** - Domain experts for .NET architecture, unit testing, and fact verification
- **Reusable Skills** - Workflows for conventional commits, README generation, and skill development
- **Validation Tooling** - Scripts to ensure skills meet Anthropic's requirements
- **Templates & Examples** - Scaffolding for creating your own agents and skills
- **Best Practices Documentation** - Comprehensive guides for quality skill development

## Installation

### Using the CLI (Recommended)

Install agents and skills from npm packs using the `claudify` CLI:

```bash
# For JS/TS projects — install as a dev dependency
pnpm add -D claudify @claudify/dotnet-pack
claudify add @claudify/dotnet-pack

# For non-JS projects — run on demand
npx -p claudify -p @claudify/dotnet-pack claudify add @claudify/dotnet-pack
```

See the [CLI](#cli) section for full usage details.

### Manual Installation

#### Skills

Copy a skill directory to your project's `.claude/skills/` folder:

```bash
cp -r .claude/skills/claudify:conventional-commit /path/to/your/project/.claude/skills/
```

#### Agents

Copy agent markdown files from `.claude/agents/` to your project and reference them in your `.claude/settings.json`.

### Skill Router (Optional)

To enable automatic skill activation:

1. Copy `.claude/hooks/`, `.claude/settings.json`, and `.claude/skills-manifest.json`
2. Install the skill-router package: `pnpm install`
3. Configure triggers in `skills-manifest.json`

## CLI

The `claudify` CLI installs agents and skills from npm packs into your project's `.claude/` directory.

### Usage

```bash
# Install everything from a pack
claudify add @claudify/dotnet-pack

# Install a specific item by name
claudify add @claudify/dotnet-pack --pick=csharp-reviewer

# Interactive selection — choose items from a checklist
claudify add @claudify/dotnet-pack --pick
```

### What it does

- Copies agent `.md` files to `.claude/agents/`
- Copies skill directories to `.claude/skills/`
- Overwrites existing files with a warning if conflicts exist
- Creates `.claude/agents/` and `.claude/skills/` directories if they don't exist

### Pack Manifest

Each pack includes a `claudify.json` manifest describing its contents:

```json
{
  "name": "@claudify/dotnet-pack",
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
      "description": "Expert .NET unit testing specialist",
      "triggers": {
        "keywords": ["unit test", "xunit"],
        "file_extensions": [".cs", ".csproj"],
        "patterns": ["write.*test"],
        "file_paths": ["tests/"]
      }
    }
  ]
}
```

Skills can include `triggers` for integration with the [Skill Router](#skill-router) auto-activation system.

## Skill Router

The skill router automatically activates relevant skills based on context. It supports two modes:

### User Prompt Mode (UserPromptSubmit)

Activates skills based on user prompt content:

1. **Extracts signals** from prompts: words, file extensions, file paths
2. **Scores skills** against signals using weighted matching
3. **Injects matched skills** into LLM context when score exceeds threshold

### Agent Mode (SubagentStart)

Injects skill activation instructions into subagents based on agent type and task content:

1. **Required skills** - Agent MUST activate before starting work
2. **Recommended skills** - Matched from compatible skills based on task prompt

Example output for `dotnet-unit-test-writer` agent:

```
## Skill Activation Required

You MUST activate the following skills before starting work:
- DotNet Unit Testing

Use the Skill tool to load each required skill.
```

### Configuration

Skills, triggers, and agent mappings are defined in `.claude/skills-manifest.json`:

```json
{
  "version": "2.0.0",
  "config": {
    "weights": {
      "keywords": 1.0,
      "file_extensions": 1.5,
      "patterns": 2.0,
      "file_paths": 2.5
    },
    "activation_threshold": 3.0
  },
  "skills": [
    {
      "path": ".claude/skills/my-skill",
      "name": "My Skill",
      "triggers": {
        "keywords": ["test", "testing"],
        "file_extensions": [".cs"],
        "patterns": ["write.*test"],
        "file_paths": ["tests/"]
      }
    }
  ],
  "agents": {
    "claudify:csharp-coder": {
      "always_skills": [],
      "compatible_skills": ["DotNet Unit Testing", "Conventional Commit"]
    },
    "claudify:dotnet-unit-test-writer": {
      "always_skills": ["DotNet Unit Testing"],
      "compatible_skills": []
    }
  }
}
```

### Agent Configuration

| Field | Description |
|-------|-------------|
| `always_skills` | Skills the agent MUST activate (mandatory) |
| `compatible_skills` | Skills scored against task prompt (optional) |

### Hook Registration

Configure hooks in `.claude/settings.json`:

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "matcher": "",
        "hooks": [{
          "type": "command",
          "command": "npx tsx \"$CLAUDE_PROJECT_DIR/.claude/hooks/skill-router.ts\""
        }]
      }
    ],
    "SubagentStart": [
      {
        "matcher": "claudify:csharp-coder",
        "hooks": [{
          "type": "command",
          "command": "npx tsx \"$CLAUDE_PROJECT_DIR/.claude/hooks/skill-router.ts\" --agent=claudify:csharp-coder"
        }]
      }
    ]
  }
}
```

### Logs

View activation history:

```bash
tail -20 .claude/logs/skill-router.log | jq .
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

### fact-checker

Verifies accuracy of written content before publishing.

**Capabilities:**

- Extract and categorize factual claims
- Cross-reference with authoritative sources
- Rate accuracy with confidence levels

**When to use:** Reviewing blog posts, documentation, or content with verifiable claims.

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

### dotnet-feature-workflow

Orchestrates end-to-end .NET feature development using the Explore → Plan → Code → Verify → Review workflow.

**Trigger:** "build feature", "implement feature", "create feature"

**Capabilities:**

- Spawns specialized agents at each phase
- TDD with tests written before implementation
- User approval gates between phases
- Automated code review before completion

**When to use:** Building complete features with quality gates and minimal hand-holding.

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

## Creating New Skills

### Quick Start

```bash
# Create a new skill from template
.claude/skills/claudify:skill-developer/scripts/create-skill.sh my-new-skill

# Validate your skill
python3 .claude/skills/claudify:skill-developer/scripts/validate-skill.py .claude/skills/my-new-skill
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
| [best-practices.md](.claude/skills/claudify:skill-developer/reference/best-practices.md) | Content quality and organization |
| [patterns.md](.claude/skills/claudify:skill-developer/reference/patterns.md) | Common skill patterns |
| [file-organization.md](.claude/skills/claudify:skill-developer/reference/file-organization.md) | Directory structure |
| [yaml-spec.md](.claude/skills/claudify:skill-developer/reference/yaml-spec.md) | Frontmatter requirements |

### Templates

| Template | Use Case |
| ---------- | ---------- |
| [basic-skill.md](.claude/skills/claudify:skill-developer/templates/basic-skill.md) | Single-purpose skills |
| [domain-skill.md](.claude/skills/claudify:skill-developer/templates/domain-skill.md) | Specialized expertise |

### Examples

| Example | Pattern |
| --------- | --------- |
| [financial-analysis.md](.claude/skills/claudify:skill-developer/examples/financial-analysis.md) | Structured data processing |
| [brand-guidelines.md](.claude/skills/claudify:skill-developer/examples/brand-guidelines.md) | Standards enforcement |

## Project Structure

```plain
claudify/
├── README.md
├── CLAUDE.md                          # Project context for Claude Code
├── package.json                       # pnpm workspace root
├── packages/
│   ├── cli/                           # claudify CLI tool
│   │   ├── src/                       # TypeScript source
│   │   └── tests/                     # Vitest tests
│   └── skill-router/                  # Auto-activation hook
│       ├── src/                       # TypeScript source
│       └── tests/                     # Vitest tests
└── .claude/
    ├── settings.json                  # Hook registration
    ├── skills-manifest.json           # Skill triggers config
    ├── hooks/
    │   └── skill-router.ts            # Hook entry point
    ├── agents/
    │   ├── claudify:dotnet-architect.md
    │   ├── claudify:csharp-coder.md
    │   ├── claudify:dotnet-unit-test-writer.md
    │   ├── claudify:csharp-code-reviewer.md
    │   └── claudify:fact-checker.md
    └── skills/
        ├── claudify:dotnet-unit-testing/
        │   ├── SKILL.md
        │   ├── reference/
        │   └── templates/
        ├── claudify:dotnet-feature-workflow/
        │   └── SKILL.md
        ├── claudify:conventional-commit/
        │   └── SKILL.md
        ├── claudify:context-file-guide/
        │   ├── SKILL.md
        │   └── scripts/
        ├── claudify:skill-developer/
        │   ├── SKILL.md
        │   ├── scripts/
        │   ├── templates/
        │   ├── examples/
        │   └── reference/
        └── claudify:readme-guide/
            └── SKILL.md
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
   pnpm --filter claudify test

   # Run skill-router tests
   pnpm --filter @claudify/skill-router test

   # Validate any new skills
   python3 .claude/skills/claudify:skill-developer/scripts/validate-skill.py .claude/skills/your-skill
   ```

5. Submit a pull request

### Guidelines

- Follow existing naming conventions
- Include comprehensive documentation
- Add examples where appropriate
- Ensure validation passes for all skills

## License

MIT
