# Basic Skill Template

Use this template for focused, single-purpose skills.

<!--
IMPORTANT SIZE REQUIREMENTS:
- Keep SKILL.md body under 500 lines (excluding YAML frontmatter)
- Total skill bundle must be under 8MB (all files combined)
- Reference files >100 lines need table of contents at top
- Link all references one level deep from SKILL.md
- Validation script enforces these limits

For detailed guidance, see reference/file-organization.md
-->

```yaml
---
name: your-skill-name
description: "What this skill does and when to use it with trigger keywords"
---

# Skill Title

Brief introduction explaining the skill's purpose and value.

## Capabilities

What this skill provides:
- **Category 1**: Specific capabilities
- **Category 2**: Specific capabilities
- **Category 3**: Specific capabilities

## How to Use

1. **Step 1**: Description
2. **Step 2**: Description
3. **Step 3**: Description

## Input Format

What data or context is needed:
- Format 1 (CSV, JSON, etc.)
- Format 2
- Format 3

## Output Format

What the skill produces:
- Result component 1
- Result component 2
- Result component 3

## Example Usage

Concrete examples of user queries:

"Example query 1"

"Example query 2"

"Example query 3"

## Scripts

Optional supporting scripts:
- `script1.py`: Description
- `script2.py`: Description

## Best Practices

1. Best practice 1
2. Best practice 2
3. Best practice 3

## Limitations

- Limitation 1
- Limitation 2
- Limitation 3
```

## When to Use This Template

- **Single-purpose skills**: One clear domain or task
- **Straightforward workflows**: Simple input → process → output
- **Minimal domain knowledge**: Doesn't require extensive background
- **Quick reference**: Users need fast, focused guidance

## Example Skills Using This Pattern

- File format conversion
- Code formatting
- Data validation
- Template application
