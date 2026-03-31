---
name: grimoire.translate-es
description: "Use when asked to translate text into Spanish. Converts English prose to Spanish while preserving all technical terms, code snippets, file paths, and technical language in English."
user_invocable: true
disable-model-invocation: true
---

# Translate to Spanish

Translate the provided English text (or your most recent output) into Spanish. All technical language stays in English.

## Rules

### Preserve in English

- Technical terms and jargon (e.g., dependency injection, middleware, endpoint, refactoring)
- Code snippets, variable names, function names, class names
- File paths, URLs, CLI commands
- Library, framework, and tool names (e.g., React, Entity Framework, Docker)
- Acronyms: API, CLI, PR, CI/CD, DI, ORM, SDK, TDD, REST, gRPC, etc.
- Inline code (anything in backticks)
- Code blocks (fenced with ```)

### Translate into Spanish

- All natural-language prose, explanations, and descriptions
- Headings and bullet point text (non-technical parts)
- Transition phrases and connectors

### Keep intact

- Markdown formatting (headings, lists, bold, italic, links)
- Code blocks and inline code
- File paths and URLs
- Numbered lists and task lists

## How to Use

When invoked with `/grimoire.translate-es`:

1. If the user provides specific text — translate that text
2. If no text is provided — translate your most recent output (plan, explanation, summary, etc.)
3. Output only the translated text, no preamble

## Example

**Input:**
> The `UserService` class handles authentication via OAuth2. You should inject it through DI in your controller. Run `dotnet test` to verify.

**Output:**
> La clase `UserService` maneja la autenticación a través de OAuth2. Debes inyectarla mediante DI en tu controller. Ejecuta `dotnet test` para verificar.
