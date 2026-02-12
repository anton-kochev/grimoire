---
name: grimoire:skill-developer
description: Create and maintain custom skills for Claude Code following official Anthropic patterns. Use when creating new skills, updating existing skills, or organizing skill documentation.
user_invocable: true
disable-model-invocation: true
---

# Skill Developer

This meta-skill teaches you how to create effective custom skills for Claude Code, following official Anthropic documentation and the progressive disclosure architecture.

## What Are Skills?

Skills are specialized knowledge modules that Claude loads when working on specific tasks. They provide:

- **Instruction sets:** Domain-specific guidance and patterns
- **Automatic activation:** Based on description keywords
- **Progressive disclosure:** Supporting files loaded on-demand
- **Context efficiency:** Only relevant content in context window

Skills live in `.claude/skills/{skill-name}/SKILL.md` with optional supporting files.

## When to Create a Skill

Create a skill when you need:

- **Consistent patterns** across multiple tasks (code style, financial analysis)
- **Domain expertise** captured in one place (industry standards, calculations)
- **Reference material** easily accessible (formulas, specifications)
- **Specialized workflows** for specific domains (multi-step processes)

**Don't create a skill when:**

- You need task execution (create an agent instead)
- It's a one-time task or simple query
- The domain is too broad or unfocused

## YAML Frontmatter Requirements

Every SKILL.md must start with YAML frontmatter:

```yaml
---
name: your-skill-name
description: "What this skill does and when to use it with trigger keywords"
---
```

### Quick Requirements

**`name` field:**

- Maximum 64 characters
- Lowercase letters, numbers, hyphens only
- Must match directory name exactly
- Cannot contain "anthropic" or "claude"

**`description` field:**

- Maximum 1024 characters
- Must include WHAT the skill does
- Must include WHEN to use it (trigger keywords)

**For detailed specifications:** See [reference/yaml-spec.md](reference/yaml-spec.md)

## Official Size and Structure Requirements

Every skill must comply with these official Anthropic requirements:

- **SKILL.md body:** Maximum 500 lines (excluding YAML frontmatter)
- **Total bundle size:** Maximum 8MB (all files combined)
- **Skills per request:** Maximum 8 skills can be loaded
- **Reference files >100 lines:** Must include table of contents at top
- **Reference file linking:** Keep all references one level deep from SKILL.md

These limits are enforced by the validation script and ensure optimal performance.

**For detailed file organization guidance:** See [reference/file-organization.md](reference/file-organization.md)

## File Structure Options

**Minimal (single file):**

```text
.claude/skills/skill-name/
└── SKILL.md
```

**Complete (progressive disclosure):**

```text
.claude/skills/skill-name/
├── SKILL.md              # Core instructions (<500 lines)
├── templates/            # Skill templates
├── examples/             # Full skill examples
├── reference/            # Detailed specifications
└── scripts/              # Automation (Python, Bash)
```

Claude loads supporting files only when relevant - **files don't consume context until accessed**. This means you can include dozens of reference files without penalty, as they're only loaded when Claude needs them.

## Content Structure Pattern

Follow this structure for SKILL.md:

1. **YAML Frontmatter** - Required (name, description)
2. **Title & Introduction** - What this skill does
3. **Capabilities** - What it can help with
4. **How to Use** - Step-by-step instructions
5. **Input/Output Format** - What goes in, what comes out
6. **Example Usage** - Concrete user queries
7. **Scripts** - Supporting automation (optional)
8. **Best Practices** - How to use well
9. **Limitations** - Boundaries and constraints

**Keep SKILL.md body under 500 lines.** Move detailed content to supporting files to stay within limits.

## Skill Creation Workflow

### 1. Define Scope

Answer before writing:

- What domain or task?
- What specific capabilities?
- What triggers activation (keywords)?
- What input does it need?
- What output does it produce?

### 2. Choose Template

Use `scripts/create-skill.sh` to scaffold from a template:

```bash
# Basic skill (single-purpose)
./scripts/create-skill.sh my-skill --template basic

# Domain skill (specialized expertise)
./scripts/create-skill.sh financial-analysis --template domain
```

**Templates:** See [templates/](templates/) directory

### 3. Write Content

Follow the content structure pattern:

- Be specific and actionable
- Use concrete examples
- Define terminology
- Keep it concise

**Best practices:** See [reference/best-practices.md](reference/best-practices.md)

### 4. Add Supporting Materials

**When to add scripts:**

- Complex calculations
- Formatting automation
- Data transformation
- Validation checks

**Progressive disclosure:**

- Detailed specs → `reference/`
- Full examples → `examples/`
- Templates → `templates/`
- Scripts → `scripts/`

### 5. Validate

```bash
./scripts/validate-skill.py .claude/skills/my-skill/SKILL.md
```

Checks:

- YAML frontmatter format
- Name requirements
- Description requirements
- Directory name matching

### 6. Test Activation

Ask questions with your description keywords:

- Should activate for relevant queries
- Should NOT activate for unrelated queries

### 7. Refine

Adjust based on:

- Does it activate when expected?
- Are instructions clear?
- Do examples work?

## Examples

**Complete skill examples:**

- [examples/financial-analysis.md](examples/financial-analysis.md) - Financial ratio calculator
- [examples/brand-guidelines.md](examples/brand-guidelines.md) - Corporate branding standards

**Common patterns:**

- [reference/patterns.md](reference/patterns.md) - Structured data, standards enforcement, workflows

## Quick Start

Create a new skill in 5 steps:

**1. Use scaffolding script:**

```bash
cd .claude/skills/skill-developer/scripts
./create-skill.sh my-new-skill
```

**2. Edit the generated SKILL.md:**

- Add capabilities
- Write "How to Use" instructions
- Include example usage
- Add best practices and limitations

**3. Validate:**

```bash
./validate-skill.py ../my-new-skill/SKILL.md
```

**4. Test:**
Ask Claude questions matching your keywords

**5. Refine:**
Adjust description and content based on activation accuracy

## Automation Scripts

**Create new skill:**

```bash
scripts/create-skill.sh <skill-name> [--template basic|domain]
```

Scaffolds directory structure and SKILL.md from template

**Validate skill:**

```bash
scripts/validate-skill.py <path-to-SKILL.md>
```

Validates YAML frontmatter and requirements

## Best Practices Summary

**Discoverability:**

- Rich descriptions with action verbs
- Include domain terms and use cases
- Multiple trigger keywords

**Content Quality:**

- Specific, actionable instructions
- Concrete examples
- Defined terminology

**Organization:**

- Clear heading hierarchy
- Logical flow (what → how → examples → practices)
- Scannable formatting (bullets, bold, code blocks)

**Progressive Disclosure:**

- Keep SKILL.md body <500 lines, total bundle <8MB
- Move detailed content to supporting files
- Files don't consume context until accessed
- Scripts execute without entering context

**For comprehensive guidelines:** See [reference/best-practices.md](reference/best-practices.md)

## Common Patterns

Skills typically follow one of these patterns:

- **Structured Data Processing** - Analysis, calculations, transformations
- **Standards Enforcement** - Branding, style guides, compliance
- **Multi-Step Workflows** - Guided processes with phases
- **Reference and Lookup** - Quick access to specifications

**Pattern details:** See [reference/patterns.md](reference/patterns.md)

## Resources

### Official Documentation

- [Agent Skills Overview](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview)
- [Skills Best Practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)

### Official Examples

- [Claude Cookbooks - Custom Skills](https://github.com/anthropics/claude-cookbooks/tree/main/skills/custom_skills)

### This Skill's Resources

- [templates/](templates/) - Basic and domain-specific templates
- [examples/](examples/) - Complete skill examples
- [reference/](reference/) - Detailed specifications and best practices
- [scripts/](scripts/) - Automation tools

## Limitations

- Skills don't execute tasks (they provide guidance to Claude)
- Custom skills don't sync across Claude surfaces (Code, API, claude.ai)
- Activation depends on keyword matching in description
- Skills load at startup (Level 1 metadata ~100 tokens per skill)
