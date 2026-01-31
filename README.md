# Claudify

A collection of specialized agents and skills for [Claude Code](https://docs.anthropic.com/en/docs/claude-code).

Extend Claude Code with domain-specific expertise, automated workflows, and reusable development patterns. Includes ready-to-use agents for .NET development and content verification, plus skills for git commits and documentation.

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Agents](#agents)
  - [dotnet-feature-builder](#dotnet-feature-builder)
  - [dotnet-architect](#dotnet-architect)
  - [csharp-coder](#csharp-coder)
  - [dotnet-unit-test-writer](#dotnet-unit-test-writer)
  - [csharp-code-reviewer](#csharp-code-reviewer)
  - [fact-checker](#fact-checker)
- [Skills](#skills)
  - [dotnet-unit-testing](#dotnet-unit-testing)
  - [conventional-commit](#conventional-commit)
  - [context-file-guide](#context-file-guide)
  - [skill-developer](#skill-developer)
  - [readme-guide](#readme-guide)
- [Creating New Skills](#creating-new-skills)
- [Project Structure](#project-structure)
- [Contributing](#contributing)
- [License](#license)

## Features

- **Pre-built Agents** - Domain experts for .NET architecture, unit testing, and fact verification
- **Reusable Skills** - Workflows for conventional commits, README generation, and skill development
- **Validation Tooling** - Scripts to ensure skills meet Anthropic's requirements
- **Templates & Examples** - Scaffolding for creating your own agents and skills
- **Best Practices Documentation** - Comprehensive guides for quality skill development

## Installation

### Skills

Copy a skill directory to your project's `.claude/skills/` folder:

```bash
# Install conventional-commit skill
cp -r skills/conventional-commit /path/to/your/project/.claude/skills/

# Install skill-developer (for creating new skills)
cp -r skills/skill-developer /path/to/your/project/.claude/skills/
```

### Agents

Add agent configurations to your Claude Code settings. Copy the agent markdown files and reference them in your `.claude/settings.json`.

## Agents

### dotnet-architect

Expert guidance for .NET application architecture following modern best practices.

**Expertise:**

- Clean Architecture and Domain-Driven Design (DDD)
- Test-Driven Development (TDD)
- .NET 8+ and C# 12 features
- Entity Framework Core patterns
- SOLID principles and dependency injection
- Azure Functions development

**When to use:** Designing new .NET services, reviewing architecture decisions, implementing domain models, or refactoring existing codebases.

### dotnet-unit-test-writer

Specialized agent for writing comprehensive unit tests in .NET projects. Powered by the [dotnet-unit-testing](#dotnet-unit-testing) skill.

**Frameworks:** xUnit (default), TUnit (for .NET 8+), Moq, NSubstitute

**Capabilities:**

- AAA (Arrange-Act-Assert) pattern implementation
- Async testing patterns
- `FakeLogger<T>` for logging verification
- Edge case and boundary testing
- Mock setup and verification

**When to use:** Writing new test suites, adding test coverage, implementing TDD workflows.

### fact-checker

Verifies accuracy of written content before publishing.

**Capabilities:**

- Extract and categorize factual claims
- Cross-reference with authoritative sources
- Rate accuracy with confidence levels
- Identify statistics, dates, quotes, and technical specifications

**When to use:** Reviewing blog posts, documentation, articles, or any content containing verifiable claims.

## Skills

### dotnet-unit-testing

Expert .NET unit testing patterns and best practices for C#/.NET projects.

**Trigger:** When writing unit tests, TDD workflows, or working with xUnit/TUnit/Moq

**Frameworks:** xUnit (default), TUnit (recommended for .NET 8+), Moq, NSubstitute

**Includes:**

- Framework selection guide and decision flowchart
- Core principles (AAA pattern, naming, isolation, async testing)
- Parameterized testing patterns (InlineData, MemberData, Matrix)
- Test organization (nested classes, traits, collections)
- Performance optimization guidelines
- xUnit and TUnit file templates

**Reference files:** `framework-guidelines.md`, `parameterized-testing.md`, `test-organization.md`, `test-performance.md`, `anti-patterns.md`

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
./skills/skill-developer/scripts/create-skill.sh my-new-skill

# Validate your skill
python3 ./skills/skill-developer/scripts/validate-skill.py ./skills/my-new-skill
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
| [best-practices.md](skills/skill-developer/reference/best-practices.md) | Content quality and organization |
| [patterns.md](skills/skill-developer/reference/patterns.md) | Common skill patterns |
| [file-organization.md](skills/skill-developer/reference/file-organization.md) | Directory structure |
| [yaml-spec.md](skills/skill-developer/reference/yaml-spec.md) | Frontmatter requirements |

### Templates

| Template | Use Case |
| ---------- | ---------- |
| [basic-skill.md](skills/skill-developer/templates/basic-skill.md) | Single-purpose skills |
| [domain-skill.md](skills/skill-developer/templates/domain-skill.md) | Specialized expertise |

### Examples

| Example | Pattern |
| --------- | --------- |
| [financial-analysis.md](skills/skill-developer/examples/financial-analysis.md) | Structured data processing |
| [brand-guidelines.md](skills/skill-developer/examples/brand-guidelines.md) | Standards enforcement |

## Project Structure

```plain
claudify/
├── README.md
├── agents/
│   ├── dotnet-architect.md
│   ├── dotnet-unit-test-writer.md
│   └── fact-checker.md
└── skills/
    ├── dotnet-unit-testing/
    │   ├── SKILL.md
    │   ├── reference/
    │   └── templates/
    ├── conventional-commit/
    │   └── SKILL.md
    ├── context-file-guide/
    │   ├── SKILL.md
    │   └── scripts/
    │       └── validate-context-file.sh
    ├── skill-developer/
    │   ├── SKILL.md
    │   ├── scripts/
    │   │   ├── create-skill.sh
    │   │   └── validate-skill.py
    │   ├── templates/
    │   ├── examples/
    │   └── reference/
    └── readme-guide/
        └── SKILL.md
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run validation on any new skills:

   ```bash
   python3 ./skills/skill-developer/scripts/validate-skill.py ./skills/your-skill
   ```

5. Submit a pull request

### Guidelines

- Follow existing naming conventions
- Include comprehensive documentation
- Add examples where appropriate
- Ensure validation passes for all skills

## License

MIT
