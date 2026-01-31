# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Claudify is a collection of specialized agents and skills for Claude Code. Agents execute tasks with specific tools; skills provide knowledge modules loaded on-demand based on description keywords.

## Commands

```bash
# Validate a skill
python3 .claude/skills/skill-developer/scripts/validate-skill.py .claude/skills/<skill-name>/SKILL.md

# Scaffold a new skill
.claude/skills/skill-developer/scripts/create-skill.sh <skill-name> [--template basic|domain]

# Validate CLAUDE.md (100-line limit)
.claude/skills/context-file-guide/scripts/validate-context-file.sh <path>
```

## Skill Requirements (Anthropic Limits)

| Constraint | Limit |
|------------|-------|
| SKILL.md body | 500 lines (excluding frontmatter) |
| Total bundle | 8 MB |
| Skills per request | 8 |
| Reference nesting | 1 level deep |

Reference files >100 lines require a table of contents.

## YAML Frontmatter

Every SKILL.md requires:

```yaml
---
name: skill-name
description: "What it does and when to use it (include trigger keywords)"
---
```

**name**: lowercase + numbers + hyphens; max 64 chars; matches directory name; no "anthropic" or "claude"

**description**: max 1024 chars; must explain WHAT and include WHEN keywords

## File Organization

```
.claude/
├── agents/           # Single .md files with persona, tools, model in frontmatter
└── skills/
    └── skill-name/
        ├── SKILL.md      # Core instructions (<500 lines)
        ├── reference/    # Detailed specs (loaded on-demand)
        ├── templates/    # Scaffolding files
        ├── examples/     # Full examples
        └── scripts/      # Automation (Python, Bash)
```

## Conventions

- Skills use progressive disclosure: supporting files don't consume context until accessed
- Agent descriptions include examples showing when to invoke them
- Skill descriptions contain trigger keywords for automatic activation
