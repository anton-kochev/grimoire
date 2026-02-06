---
name: claudify:conventional-commit
description: "Generate git commits following Conventional Commits 1.0.0. Use for /conventional-commit, git commit, or when committing changes."
user_invocable: true
disable-model-invocation: true
---

# Git Commit Generator

Generate git commit messages following the [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/) specification.

## Commit Message Format

```plain
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

## Types

| Type | Description |
| ------ | ------------- |
| `feat` | New feature (correlates with MINOR in SemVer) |
| `fix` | Bug fix (correlates with PATCH in SemVer) |
| `docs` | Documentation only changes |
| `style` | Code style (formatting, semicolons, etc.) - no logic change |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `perf` | Performance improvement |
| `test` | Adding or correcting tests |
| `build` | Build system or external dependencies |
| `ci` | CI configuration files and scripts |
| `chore` | Other changes that don't modify src or test files |

## Breaking Changes

For breaking changes, either:

- Add `BREAKING CHANGE:` footer in body

Breaking changes correlate with MAJOR in SemVer.

## Workflow

When user invokes /commit:

1. **Check staged changes**:

   ```bash
   git status
   git diff --cached
   ```

2. **Check recent commits** for style consistency:

   ```bash
   git log --oneline -10
   ```

3. **Analyze changes** and determine:
   - Filter out trivial changes (see below)
   - Primary type (feat, fix, docs, etc.)
   - Scope if applicable (component, module, or file area)
   - Concise description (imperative mood, no period)
   - Whether body is needed for complex changes

4. **Generate commit** using HEREDOC for proper formatting:

   ```bash
   git commit -m "$(cat <<'EOF'
   type(scope): description

   Optional body explaining what and why.
   EOF
   )"
   ```

5. **Verify** the commit was created:

   ```bash
   git log -1
   ```

## Filtering Trivial Changes

Ignore changes that don't affect functionality or user experience:

- Whitespace adjustments (indentation, line breaks, trailing newlines)
- Code formatting/style changes (line wrapping, bracket positioning)
- Comment formatting
- Import reordering without additions/removals

Only document changes with semantic meaning or technical impact. For pure formatting commits, use simple descriptions like "format code" or "apply linting fixes".

## Rules

- Focus on primary purpose and impact, not implementation details
- Description must be lowercase, imperative mood ("add feature" not "added feature")
- No period at end of description
- Keep description under 72 characters
- Scope is optional but recommended for larger codebases
- Body should explain "what" and "why", not "how"
- Be concise—avoid redundant or verbose language
- **Never** use `--no-verify` unless explicitly requested
- **Never** amend commits that have been pushed to remote
- **Never** include Co-Authored-By footers in commit messages

## Examples

**Simple feature:**

```plain
feat: add health check endpoint
```

**Feature with scope:**

```plain
feat(api): add CSV enrichment endpoint
```

**Fix with body:**

```plain
fix(validation): handle empty date fields

Previously empty dates caused NullReferenceException.
Now validates and rejects rows with empty required fields.
```

**Breaking change:**

```plain
feat(api)!: change enrichment response format

BREAKING CHANGE: Response now returns JSON wrapper with metadata
instead of raw CSV. Clients must update parsing logic.
```

**Documentation:**

```plain
docs: update README with API examples
```

**Multiple changes (pick primary):**
When changes span multiple types, use the most significant one and mention others in body.
