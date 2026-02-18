# Skill File Organization Guide

This guide provides comprehensive recommendations for organizing skill files to maximize performance, maintainability, and compliance with official Anthropic requirements.

## Table of Contents

- [Core Principles](#core-principles)
- [Progressive Disclosure Architecture](#progressive-disclosure-architecture)
- [Size Constraints](#size-constraints)
- [Reference File Standards](#reference-file-standards)
- [Linking Requirements](#linking-requirements)
- [Table of Contents Requirements](#table-of-contents-requirements)
- [File Size Optimization](#file-size-optimization)
- [Well-Organized Examples](#well-organized-examples)
- [Anti-Patterns](#anti-patterns)

## Core Principles

Effective skill organization follows these key principles:

1. **Progressive Disclosure**: Core content in SKILL.md, detailed content in supporting files
2. **Lazy Loading**: Files don't consume context until Claude accesses them
3. **Flat Hierarchy**: Keep references one level deep from SKILL.md
4. **Size Compliance**: Stay under official limits for performance
5. **Discoverability**: Clear file names and organization

## Progressive Disclosure Architecture

### How It Works

Progressive disclosure allows skills to contain extensive reference material without impacting context:

- **Level 1 (Metadata)**: ~100 tokens per skill loaded at startup
- **Level 2 (SKILL.md)**: Loaded when skill activates (up to 500 lines)
- **Level 3 (Supporting Files)**: Loaded only when Claude needs them

### Key Insight

**Files don't consume context until accessed** - you can include dozens of reference files without penalty. The skill acts like a table of contents, pointing Claude to detailed materials as needed.

### What Belongs Where

**SKILL.md should contain:**
- Overview and capabilities
- How to use instructions
- When to activate (trigger keywords)
- Common use cases
- Links to detailed reference materials
- Essential examples

**Supporting files should contain:**
- Detailed specifications
- Complete API references
- Extended examples
- Technical deep-dives
- Complex workflows
- Large data tables

## Size Constraints

### Official Anthropic Requirements

**SKILL.md Body**
- Maximum: **500 lines** (excluding YAML frontmatter)
- Enforced: Validation script blocks if exceeded
- Rationale: Optimal context window usage

**Total Skill Bundle**
- Maximum: **8MB** (all files combined)
- Enforced: Validation script blocks if exceeded
- Includes: SKILL.md + all supporting files + scripts

**Skills Per Request**
- Maximum: **8 skills** can be active per request
- Context: Claude Code loads skills based on relevance

### Why These Limits Matter

- **Performance**: Smaller files load faster into context
- **Cost**: Fewer tokens consumed per activation
- **Maintainability**: Easier to update and navigate
- **Compliance**: Required by Anthropic platform

## Reference File Standards

### Naming Conventions

Use descriptive, hyphenated names:

```text
✅ GOOD:
reference/api-specification.md
reference/calculation-formulas.md
reference/error-codes.md

❌ BAD:
reference/spec.md (too generic)
reference/api_spec.md (underscores instead of hyphens)
reference/APISpecification.md (camelCase)
```

### Directory Structure

Keep structure flat and organized:

```text
.claude/skills/your-skill/
├── SKILL.md                    # Main skill file (<500 lines)
├── reference/                  # Detailed specifications
│   ├── api-specification.md
│   ├── data-formats.md
│   └── error-handling.md
├── examples/                   # Complete examples
│   ├── basic-usage.md
│   └── advanced-workflow.md
├── templates/                  # Reusable templates
│   └── report-template.md
└── scripts/                    # Automation (optional)
    └── process-data.py
```

### Single File vs. Multiple Files

**Use a single reference file when:**
- Content is tightly related (<200 lines)
- Splitting would create artificial boundaries
- Users typically need all information together

**Use multiple reference files when:**
- Content has distinct topics
- Individual files would be >100 lines each
- Users may need only specific sections
- Improves navigation and maintenance

## Linking Requirements

### One Level Deep Rule

**All reference files must link directly from SKILL.md** - do not nest references within other references.

#### ✅ CORRECT: One Level Deep

**SKILL.md:**
```markdown
For detailed API specifications, see [reference/api-specification.md](reference/api-specification.md).

For error handling guidelines, see [reference/error-handling.md](reference/error-handling.md).
```

**reference/api-specification.md:**
```markdown
# API Specification

## Endpoints

### POST /api/process
...
```

**reference/error-handling.md:**
```markdown
# Error Handling Guidelines

## Error Codes
...
```

#### ❌ INCORRECT: Nested References

**SKILL.md:**
```markdown
For API information, see [reference/api-overview.md](reference/api-overview.md).
```

**reference/api-overview.md:**
```markdown
# API Overview

For detailed endpoint specifications, see [reference/endpoints/post-endpoints.md](reference/endpoints/post-endpoints.md).
```

**Why this is wrong:** The user would need to read api-overview.md first, then follow a nested link. Claude should be able to read any reference file directly from SKILL.md.

### Why One Level Deep?

1. **Ensures complete reads**: Claude reads full files when accessing from SKILL.md
2. **Avoids fragmentation**: User doesn't navigate multiple levels
3. **Improves discoverability**: All references visible from main file
4. **Simplifies maintenance**: Clear file relationships

### Proper Linking Format

Use relative paths with descriptive link text:

```markdown
✅ GOOD:
See [API Specification](reference/api-specification.md) for complete endpoint details.

For calculation formulas, refer to [reference/formulas.md](reference/formulas.md).

❌ BAD:
See api-specification.md (not a clickable link)
See [here](reference/api-specification.md) (non-descriptive)
See [API](../reference/api-specification.md) (unnecessary path navigation)
```

## Table of Contents Requirements

### When Required

**Reference files exceeding 100 lines must include a table of contents at the top.**

### Why This Matters

Even when Claude previews a file with partial reads, the table of contents ensures Claude can see the full scope of available information.

### Format

Place TOC immediately after the file title:

```markdown
# API Specification

## Table of Contents

- [Authentication](#authentication)
- [Endpoints](#endpoints)
  - [POST /api/process](#post-apiprocess)
  - [GET /api/status](#get-apistatus)
- [Error Codes](#error-codes)
- [Rate Limiting](#rate-limiting)
- [Examples](#examples)

## Authentication

...
```

### Best Practices

- Use descriptive section names
- Link to section anchors (GitHub-style)
- Keep TOC concise (one level of nesting max)
- Update TOC when adding/removing sections

## File Size Optimization

### Strategies to Stay Under Limits

#### 1. Split Large Sections

Instead of one large reference file, split by topic:

```text
Before (800 lines):
reference/complete-guide.md

After:
reference/getting-started.md (150 lines)
reference/advanced-usage.md (180 lines)
reference/api-reference.md (220 lines)
reference/troubleshooting.md (150 lines)
```

#### 2. Remove Redundancy

- Don't repeat information from SKILL.md in reference files
- Link between files instead of duplicating content
- Use templates for repetitive structures

#### 3. Move Examples to Dedicated Files

```text
examples/
├── basic-usage.md           # Simple examples
├── advanced-workflow.md     # Complex examples
└── integration-patterns.md  # Real-world scenarios
```

#### 4. Use External Scripts

Move complex logic to Python/Bash scripts instead of documenting in markdown:

```text
scripts/
└── calculate-ratios.py  # Actual calculation logic

reference/
└── calculations.md      # High-level explanation + script usage
```

#### 5. Compress Tables and Data

Instead of large markdown tables, consider:
- CSV files referenced by scripts
- JSON data files
- External databases (when appropriate)

### Checking Your Size

Use the validation script to check current size:

```bash
cd ~/.claude/skills/skill-developer
python scripts/validate-skill.py ~/.claude/skills/your-skill/SKILL.md
```

Output shows:
- Line count for SKILL.md body
- Total bundle size
- Largest files
- Recommendations

## Well-Organized Examples

### Example 1: Financial Analysis Skill

```text
.claude/skills/financial-analysis/
├── SKILL.md (287 lines)          # Core skill definition
├── reference/
│   ├── ratio-formulas.md (156 lines, has TOC)
│   ├── industry-standards.md (98 lines)
│   └── data-sources.md (45 lines)
├── examples/
│   ├── quarterly-analysis.md
│   └── peer-comparison.md
└── scripts/
    └── calculate-ratios.py

Total size: 1.2MB
```

**Why this works:**
- SKILL.md under 500 lines
- Reference files split by topic
- File >100 lines has TOC
- All references one level from SKILL.md
- Total bundle well under 8MB

### Example 2: API Documentation Skill

```text
.claude/skills/api-docs/
├── SKILL.md (421 lines)
├── reference/
│   ├── authentication.md (87 lines)
│   ├── endpoints.md (234 lines, has TOC)
│   ├── error-codes.md (112 lines, has TOC)
│   └── rate-limiting.md (56 lines)
└── examples/
    ├── basic-requests.md
    └── advanced-patterns.md

Total size: 892KB
```

**Why this works:**
- Clear separation of concerns
- Large files have TOCs
- Flat reference structure
- Size well within limits

## Anti-Patterns

### ❌ Anti-Pattern 1: Monolithic SKILL.md

```text
.claude/skills/bad-example/
└── SKILL.md (1,247 lines)  # Way over 500-line limit
```

**Problem**: Exceeds size limit, hard to maintain, poor context efficiency

**Solution**: Split into SKILL.md + reference files

### ❌ Anti-Pattern 2: Nested References

```text
.claude/skills/bad-example/
├── SKILL.md
└── reference/
    ├── overview.md → links to detailed/
    └── detailed/
        ├── section1.md
        └── section2.md
```

**Problem**: Violates "one level deep" rule

**Solution**: Flatten to reference/*.md, all linked from SKILL.md

### ❌ Anti-Pattern 3: Missing TOCs

```text
reference/
└── massive-api-spec.md (847 lines, NO TOC)
```

**Problem**: Claude can't see full scope in partial read

**Solution**: Add comprehensive TOC at top of file

### ❌ Anti-Pattern 4: Unclear File Names

```text
reference/
├── stuff.md
├── misc.md
└── notes.md
```

**Problem**: Non-descriptive, hard to know what to read

**Solution**: Use descriptive names (api-specification.md, data-formats.md)

### ❌ Anti-Pattern 5: Bloated Bundle

```text
.claude/skills/bad-example/
├── SKILL.md
├── reference/ (47 files, 12MB total)
└── examples/ (hundreds of examples)
```

**Problem**: Exceeds 8MB limit

**Solution**: Remove redundancy, consolidate files, use external resources

## Summary Checklist

When organizing your skill, verify:

- [ ] SKILL.md body is under 500 lines
- [ ] Total skill bundle is under 8MB
- [ ] All references link directly from SKILL.md (one level deep)
- [ ] Reference files >100 lines have table of contents
- [ ] File names are descriptive and use hyphens
- [ ] Directory structure is flat and logical
- [ ] No redundant content across files
- [ ] Validation script passes without errors

## Validation

Always validate your skill organization:

```bash
python ~/.claude/skills/skill-developer/scripts/validate-skill.py \
  ~/.claude/skills/your-skill/SKILL.md
```

The script will check all requirements and provide actionable feedback for any violations.
