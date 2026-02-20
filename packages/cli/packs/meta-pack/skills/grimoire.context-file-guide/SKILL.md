---
name: grimoire.context-file-guide
description: "Best practices for writing CLAUDE.md project context files. Use when creating, reviewing, or improving CLAUDE.md files for Claude Code projects."
version: 1.0.0
---

# CLAUDE.md Best Practices Guide

This skill provides best practices for writing effective CLAUDE.md files that give Claude Code the right context about your project.

## What is CLAUDE.md?

CLAUDE.md is a special file that Claude Code automatically reads when starting a conversation. It provides project-specific context, conventions, and instructions that help Claude understand your codebase and work more effectively.

## File Locations

Claude Code reads CLAUDE.md files from multiple locations (in order of precedence):

1. **Project root**: `./CLAUDE.md` - Primary project context
2. **Parent directories**: `../CLAUDE.md` - Shared context for monorepos
3. **Home directory**: `~/.claude/CLAUDE.md` - Personal global preferences

All found files are concatenated, so use each level appropriately.

## Recommended Structure

Use this battle-tested structure:

```markdown
# Project: {Project Name}

## Tech Stack
- Backend: {frameworks, runtime, database}
- Frontend: {frameworks, language, styling}
- Testing: {test frameworks}

## Commands
- {command}: {description}
- {command}: {description}
- {command}: {description}

## Code Conventions
- {convention 1}
- {convention 2}
- {convention 3}

## Architecture
- {pattern}: {brief description}
- {routes/structure}: {pattern}
- See {doc reference} for details

## Workflow
- {pre-commit steps}
- {development approach}
- {commit guidelines}
```

## Example

```markdown
# Project: E-commerce API

## Tech Stack
- Backend: .NET 8, Entity Framework Core 8, PostgreSQL
- Frontend: Vue 3 Composition API, TypeScript, Tailwind CSS
- Testing: xUnit, Playwright, Vue Test Utils

## Commands
- dotnet build: Build backend
- dotnet test --filter "Category=Unit": Run unit tests
- pnpm dev: Start frontend dev server
- pnpm test:unit: Run Vue tests

## Code Conventions
- Use records for DTOs and value objects
- Prefer async/await with ConfigureAwait(false)
- Use Composition API with <script setup> in Vue
- Name test files *.spec.ts (frontend) or *Tests.cs (backend)

## Architecture
- Clean Architecture: Adapters → Application → Domain
- API routes: /api/v1/{resource}
- See docs/architecture.md for detailed diagrams

## Workflow
- Run dotnet format and pnpm lint before committing
- Write tests before implementation (TDD)
- One logical change per commit
```

## Section Guidelines

### Tech Stack
- List primary technologies with versions
- Group by concern (backend, frontend, testing, infrastructure)
- Include database, ORM, and major libraries

### Commands
- Use format: `command: description`
- Include build, test, lint, and dev commands
- Add flags for common variations (e.g., unit vs integration tests)

### Code Conventions
- Focus on project-specific patterns
- Include naming conventions for files and code
- Note any non-obvious practices

### Architecture
- Name the architectural pattern
- Describe layer organization
- Reference detailed documentation if it exists

### Workflow
- Pre-commit checklist items
- Development methodology (TDD, etc.)
- Commit message guidelines

## Best Practices

### Keep It Concise
- **Maximum 100 lines** - anything longer should use imports
- Aim for 30-60 lines for most projects
- Focus on frequently-needed information
- Update as project evolves

### Be Specific and Actionable
```markdown
# Good
- dotnet test --filter "Category=Unit": Run unit tests

# Bad
- Tests are important
```

### Include Context That Saves Time
- Explain non-obvious architectural decisions
- Document project-specific terminology
- Note any unusual patterns or exceptions

## Advanced Context Management

Use imports for detailed context without bloating CLAUDE.md. The `@docs/file.md` syntax pulls in additional files when Claude needs them.

### Memory Bank Structure

For complex projects, create a docs folder with specialized context files:

```
docs/
├── architecture.md      # System design decisions
├── api-conventions.md   # REST patterns, error handling
├── testing-guide.md     # Test patterns and fixtures
└── plan.md              # Current implementation checklist
```

### Using Imports

Reference these files in CLAUDE.md with the `@` syntax:

```markdown
## Architecture
- Clean Architecture: Adapters → Application → Domain
- @docs/architecture.md for detailed diagrams

## API Design
- @docs/api-conventions.md
```

This keeps the main CLAUDE.md lean while providing deep context on demand.

## Validation

Validate your CLAUDE.md meets the 100-line limit:

```bash
./scripts/validate-context-file.sh CLAUDE.md
```

The script checks line count and suggests using imports if the file is too long.

## Anti-Patterns to Avoid

1. **Too verbose**: Don't include entire documentation
2. **Too generic**: Avoid boilerplate that applies to any project
3. **Outdated**: Remove references to deleted files/features
4. **Instruction overload**: Don't micromanage every decision
5. **Security information**: Never include secrets or credentials

## When to Update CLAUDE.md

- Adding new major dependencies
- Changing build or test commands
- Introducing new architectural patterns
- After significant refactoring
- When onboarding reveals missing context

## Limitations

- CLAUDE.md is read at conversation start (not refreshed mid-conversation)
- Very large files may impact context window efficiency
- Cannot include executable code or scripts
- Content is shared with Claude - avoid sensitive information
