# Skill Best Practices

Comprehensive best practices for creating high-quality, discoverable, and maintainable skills.

## Content Quality

### Be Specific and Actionable

**Good:**

```markdown
"Calculate ROE by dividing net income by shareholder equity"
```

**Bad:**

```markdown
"Calculate financial ratios appropriately"
```

**Why:** Specific instructions tell Claude exactly what to do. Vague guidance leads to inconsistent results.

### Use Concrete Examples

**Good:**

```markdown
"What's the P/E ratio if the stock price is $50 and EPS is $2.50?"
```

**Bad:**

```markdown
"Calculate P/E ratio"
```

**Why:** Concrete examples show users how to interact with the skill and demonstrate expected output.

### Define Terminology

**Good:**

```markdown
- **ROE (Return on Equity)**: Net Income ÷ Shareholder Equity
  Measures how effectively a company uses shareholder capital
```

**Bad:**

```markdown
- ROE: A profitability ratio
```

**Why:** Clear definitions help both Claude and users understand domain-specific terms.

## Organization

### Clear Hierarchy

Use consistent heading levels:

- `##` for major sections (Capabilities, How to Use, Best Practices)
- `###` for subsections (within major sections)
- `####` sparingly for deep topics (only when necessary)

### Logical Flow

Organize content in this order:

1. **Introduction** - What is this skill?
2. **Capabilities** - What can it do?
3. **How to Use** - Step-by-step instructions
4. **Input/Output** - What goes in, what comes out
5. **Examples** - Show concrete usage
6. **Scripts** - Supporting automation (if applicable)
7. **Best Practices** - How to use it well
8. **Limitations** - Boundaries and constraints

**Why:** This flow matches how users think: "What is it?" → "What does it do?" → "How do I use it?" → "What should I watch out for?"

### Scannable Content

Format for easy scanning:

- **Bullet lists** for options, features, or categories
- **Numbered lists** for sequential steps or workflows
- **Bold** for key terms and important concepts
- **Code blocks** for examples, formulas, or syntax
- **Tables** for comparisons or structured data

**Example:**

```markdown
## Capabilities

Calculate these ratio categories:
- **Profitability**: ROE, ROA, margins
- **Liquidity**: Current ratio, quick ratio
- **Leverage**: Debt-to-equity, coverage ratios
```

## Discoverability

### Rich Descriptions with Keywords

**Good:**

```yaml
description: "Python data science coding patterns and best practices. Use when writing Python code, analyzing data, creating visualizations, or working with pandas and numpy"
```

**Bad:**

```yaml
description: "Helps with Python programming"
```

**Why:** Rich descriptions with multiple keywords increase activation accuracy.

### Multiple Trigger Points

Include variety in your description:

- **Synonyms:** "branding" AND "styling"
- **File types:** "PowerPoint", "Excel", "PDF"
- **Actions:** "creating", "formatting", "analyzing", "validating"
- **Domain terms:** "financial ratios", "brand guidelines", "API patterns"
- **Natural phrases:** How users actually ask questions

**Example:**

```yaml
description: "This skill applies consistent corporate branding and styling to all generated documents including PowerPoint, Excel, and PDF files. Use when creating, formatting, or reviewing branded materials."
# Covers: branding, styling, documents, specific file types, multiple action verbs
```

## Progressive Disclosure

### Keep Core Instructions Concise

**Main SKILL.md body:** Maximum 500 lines (excluding YAML frontmatter)

- Essential instructions only
- High-level workflow
- Links to supporting files
- Enforced by validation script

**Total skill bundle:** Maximum 8MB (all files combined)

- Includes SKILL.md + all supporting files + scripts
- Enforced by validation script

**Supporting files:** Loaded on-demand

- Detailed specifications → `reference/`
- Full examples → `examples/`
- Templates → `templates/`
- Scripts → `scripts/`
- **Files don't consume context until accessed** - you can include dozens of reference files without penalty

### When to Split Content

**Keep in SKILL.md:**

- Overview and purpose
- Key capabilities
- Basic usage steps
- Simple examples
- Links to detailed resources

**Move to supporting files:**

- Full skill examples (>50 lines)
- Detailed API specifications
- Complete templates
- Extensive best practices guides
- Industry benchmarks or lookup tables

### Reference File Organization Standards

**One Level Deep Linking:**

All reference files must link directly from SKILL.md - do not nest references within other references. This ensures Claude can read any reference file directly without navigation.

**Example (correct):**

```markdown
<!-- SKILL.md -->
For API details, see [reference/api-specification.md](reference/api-specification.md).
For error handling, see [reference/error-handling.md](reference/error-handling.md).
```

**Table of Contents for Long Files:**

Reference files exceeding 100 lines must include a table of contents at the top. This ensures Claude can see the full scope even in partial reads.

**Example:**

```markdown
# API Specification

## Table of Contents

- [Authentication](#authentication)
- [Endpoints](#endpoints)
- [Error Codes](#error-codes)

## Authentication
...
```

### Size Limit Guidelines

**SKILL.md body: 500 lines maximum (enforced)**

If approaching this limit:
- Extract detailed sections to reference files
- Move full examples to `examples/` directory
- Keep only essential instructions in SKILL.md

**Total skill bundle: 8MB maximum (enforced)**

If approaching this limit:
- Remove redundant content
- Compress or remove large images
- Split large reference files by topic
- Use external resources for very large datasets

**Reference files >100 lines: Add table of contents (warned if missing)**

This is a strong recommendation but not enforced with blocking errors.

**For comprehensive file organization guidance:** See [reference/file-organization.md](reference/file-organization.md)

## Scripts and Automation

### When to Bundle Scripts

Add scripts for:

- **Complex calculations** (financial ratios, statistical analysis)
- **Formatting automation** (brand application, document generation)
- **Data transformation** (parsing, conversion, validation)
- **Validation** (compliance checking, quality assurance)

### Script Documentation

Always document scripts clearly:

```markdown
## Scripts

- `calculate_ratios.py`: Main calculation engine for all financial ratios
  - Input: Financial statement dict or CSV
  - Output: Dict of calculated ratios with interpretations
  - Usage: Called automatically when ratio calculation requested

- `interpret_ratios.py`: Provides interpretation and benchmarking
  - Input: Calculated ratios dict
  - Output: Textual interpretation with industry comparisons
  - Usage: Called after calculations for context
```

### Benefits of Scripts

- **Context efficiency:** Script code never enters context, only output
- **Reliability:** Deterministic operations (calculations, formatting)
- **Maintainability:** Update logic without changing skill instructions

## Testing and Validation

### Test Activation

1. **Positive tests:** Ask questions matching your keywords

   ```text
   "Calculate financial ratios for this company"  # Should activate
   "Analyze the P/E ratio"                       # Should activate
   ```

2. **Negative tests:** Ask unrelated questions

   ```text
   "What's the weather today?"                   # Should NOT activate
   "Write a Python function"                     # Should NOT activate (unless Python skill)
   ```

### Test Instructions

1. Follow your own "How to Use" steps
2. Verify examples work as described
3. Check that outputs match "Output Format" section
4. Ensure limitations are accurate

### Quality Checklist

Before finalizing:

**YAML Frontmatter:**

- [ ] Name is lowercase with hyphens, ≤64 chars
- [ ] Name matches directory name
- [ ] Description ≤1024 chars
- [ ] Description includes WHAT and WHEN
- [ ] No reserved words or XML tags

**Content:**

- [ ] Clear introduction
- [ ] Specific, actionable instructions
- [ ] Concrete examples
- [ ] Defined terminology
- [ ] Proper heading hierarchy

**Supporting Files:**

- [ ] Relative paths are correct
- [ ] Files exist in expected locations
- [ ] Scripts are documented
- [ ] No broken links

## Common Anti-Patterns

### ❌ Don't: Overly Broad Scope

```yaml
# Too broad - won't activate reliably
description: "Helps with programming tasks"
```

**Do:** Focus on specific domain

```yaml
description: "Python data science coding patterns for pandas and numpy. Use when analyzing data or creating visualizations"
```

### ❌ Don't: Missing Trigger Keywords

```yaml
description: "Contains financial information"
```

**Do:** Include action verbs and use cases

```yaml
description: "Calculates financial ratios and metrics from financial statement data for investment analysis"
```

### ❌ Don't: Vague Instructions

```markdown
## How to Use

1. Provide data
2. Get results
```

**Do:** Be specific

```markdown
## How to Use

1. **Provide financial statements:** Upload income statement, balance sheet, or provide revenue/earnings figures
2. **Specify ratios:** Request specific ratios (P/E, ROE) or "all" for comprehensive analysis
3. **Review results:** Calculated ratios with industry benchmarks and trend analysis
```

### ❌ Don't: Embed Large Examples

```markdown
# SKILL.md (1000+ lines with full examples)
```

**Do:** Extract to separate files

```markdown
# SKILL.md (300 lines)
See `examples/financial-analysis.md` for a complete example.
```

## Maintenance

### Keep Skills Updated

- Review quarterly for accuracy
- Update examples as best practices evolve
- Add new capabilities incrementally
- Deprecate outdated information

### Version Control

Use git to track changes:

```bash
git commit -m "skill-developer: Add visualization examples"
```

### Gather Feedback

Monitor skill effectiveness:

- Does it activate when expected?
- Are instructions clear to users?
- Do examples work correctly?
- Are there common questions not covered?

## Resources

- [Official Skills Documentation](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview)
- [Anthropic Cookbooks - Custom Skills](https://github.com/anthropics/claude-cookbooks/tree/main/skills/custom_skills)
