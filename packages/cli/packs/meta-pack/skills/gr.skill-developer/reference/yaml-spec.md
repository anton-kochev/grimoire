# YAML Frontmatter Specification

Complete specification for skill YAML frontmatter requirements based on official Anthropic documentation.

## Table of Contents

- [Required Structure](#required-structure)
- [File Size Constraints](#file-size-constraints)
- [Field Requirements](#field-requirements)
  - [name Field](#name-field)
  - [description Field](#description-field)
- [Keyword Strategy](#keyword-strategy)
- [Validation Checklist](#validation-checklist)
- [Directory Naming](#directory-naming)
- [Source](#source)

## Required Structure

Every SKILL.md file MUST start with YAML frontmatter:

```yaml
---
name: your-skill-name
description: Brief description of what this Skill does and when to use it
---
```

## File Size Constraints

Every skill must comply with these official Anthropic size limits:

### SKILL.md Body Size

**Maximum:** 500 lines (excluding YAML frontmatter)

**Enforcement:** Validation script will block skills exceeding this limit

**Rationale:** Optimal context window usage and performance

**How to comply:**
- Keep core instructions in SKILL.md
- Move detailed content to supporting files (reference/, examples/, templates/)
- Link to supporting files for additional details

### Total Skill Bundle Size

**Maximum:** 8MB (all files combined)

**Includes:** SKILL.md + all supporting files (reference/, examples/, templates/, scripts/)

**Enforcement:** Validation script will block if total size exceeds limit

**How to comply:**
- Remove redundant content
- Compress or remove large images
- Split large files by topic
- Use external resources for very large datasets

### Skills Per Request Limit

**Maximum:** 8 skills can be loaded per request

**Context:** Claude Code automatically loads relevant skills based on user queries. This limit ensures context window efficiency.

### Additional Requirements

**Reference files >100 lines:** Should include a table of contents at the top

**Enforcement:** Validation script warns (non-blocking) if missing

**Purpose:** Ensures Claude can see full scope even in partial file reads

**Reference file linking:** Keep all references one level deep from SKILL.md

**Enforcement:** Validation script warns if nested references detected

**Purpose:** Ensures Claude can access any reference directly from SKILL.md

## Field Requirements

### `name` Field

**Type:** String
**Required:** Yes
**Maximum length:** 64 characters

**Format rules:**

- Lowercase letters only (a-z)
- Numbers allowed (0-9)
- Hyphens allowed as separators (-)
- No other characters (no underscores, spaces, or special characters)
- No XML tags
- Must match directory name exactly

**Reserved words (cannot use):**

- "anthropic"
- "claude"

**Examples:**

✅ **Valid names:**

- `analyzing-financial-statements`
- `python-data-science`
- `brand-guidelines-2024`
- `api-design-patterns`

❌ **Invalid names:**

- `Analyzing_Financial_Statements` (uppercase, underscores)
- `python data science` (spaces)
- `claude-helper` (reserved word)
- `api.design.patterns` (periods not allowed)
- `very-long-skill-name-that-exceeds-the-sixty-four-character-limit-for-names` (>64 chars)

### `description` Field

**Type:** String
**Required:** Yes
**Minimum length:** 1 character (non-empty)
**Maximum length:** 1024 characters

**Content requirements:**

- No XML tags
- Must include BOTH:
  1. **What** the skill does (functionality)
  2. **When** to use it (trigger keywords)

**Purpose:**
The description enables Claude's automatic skill activation. When users ask questions matching keywords in the description, Claude loads this skill.

**Best practice formula:**

```text
[Domain/Technology] + [What it does] + [When/Keywords for activation]
```

**Examples:**

✅ **Good descriptions:**

```yaml
description: "This skill calculates key financial ratios and metrics from financial statement data for investment analysis"
# Keywords: financial ratios, metrics, financial statement, investment analysis

description: "Python coding standards and patterns for data science projects. Use when writing Python code, analyzing data, or creating visualizations"
# Keywords: Python, coding standards, data science, writing code, analyzing data, visualizations

description: "This skill applies consistent corporate branding and styling to all generated documents including colors, fonts, layouts, and messaging"
# Keywords: branding, styling, documents, colors, fonts, layouts, messaging
```

❌ **Bad descriptions:**

```yaml
description: "Helps with finance"
# Too vague, no trigger keywords

description: "Contains brand information"
# No actionable keywords, doesn't explain when to use

description: "ROE, ROA, P/E calculator"
# Too technical without context, unclear when to activate
```

## Keyword Strategy

Include these in your description for better discoverability:

1. **Domain/Technology terms:** "financial analysis", "Python", "brand guidelines"
2. **Action verbs:** "calculates", "applies", "analyzes", "creates", "validates"
3. **Object nouns:** "ratios", "documents", "code", "data", "reports"
4. **Use cases:** "investment analysis", "data science projects", "corporate branding"
5. **Natural phrases:** How users would actually ask questions

## Validation Checklist

Before finalizing frontmatter:

- [ ] YAML starts with `---` on its own line
- [ ] YAML ends with `---` on its own line
- [ ] `name` field present and not empty
- [ ] `name` is ≤64 characters
- [ ] `name` uses only lowercase, numbers, hyphens
- [ ] `name` doesn't contain "anthropic" or "claude"
- [ ] `name` matches directory name exactly
- [ ] `description` field present and not empty
- [ ] `description` is ≤1024 characters
- [ ] `description` explains WHAT skill does
- [ ] `description` includes WHEN keywords
- [ ] No XML tags in any field
- [ ] No trailing spaces or formatting issues

## Directory Naming

The skill directory name must match the `name` field exactly:

```text
✅ Correct:
.claude/skills/analyzing-financial-statements/
  └── SKILL.md (name: analyzing-financial-statements)

❌ Incorrect:
.claude/skills/financial-analysis/
  └── SKILL.md (name: analyzing-financial-statements)
  # Mismatch! Directory doesn't match name field
```

## Source

Based on [Official Claude Code Skills Documentation](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview)
