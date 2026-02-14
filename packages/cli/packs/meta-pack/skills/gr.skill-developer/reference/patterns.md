# Common Skill Patterns

Proven patterns for different types of skills, based on Anthropic cookbook examples.

## Table of Contents

- [Pattern 1: Structured Data Processing](#pattern-1-structured-data-processing)
- [Pattern 2: Standards Enforcement](#pattern-2-standards-enforcement)
- [Pattern 3: Multi-Step Workflows](#pattern-3-multi-step-workflows)
- [Pattern 4: Reference and Lookup](#pattern-4-reference-and-lookup)
- [Choosing the Right Pattern](#choosing-the-right-pattern)
- [Mixing Patterns](#mixing-patterns)
- [Resources](#resources)

## Pattern 1: Structured Data Processing

**Use for:** Skills that process structured data (financial analysis, scientific calculations, data transformation)

### Characteristics

- Clear input format requirements
- Deterministic processing steps
- Structured output with calculations
- Often includes scripts for complex logic

### Structure Template

```markdown
## Capabilities

Process and analyze:
- **Data Type 1**: Specific processing
- **Data Type 2**: Specific calculations
- **Data Type 3**: Specific transformations

## Input Format

Accepts multiple formats:
- **CSV**: Column headers: Field1, Field2, Field3
- **JSON**: `{"field1": value, "field2": value}`
- **Excel**: Sheet name "Data" with labeled rows

Minimum required fields:
- Field1 (required): Description
- Field2 (required): Description
- Field3 (optional): Description

## Processing Steps

1. **Validate data completeness**
   - Check all required fields present
   - Verify data types and ranges
   - Handle missing values appropriately

2. **Transform to standard format**
   - Normalize units and scales
   - Convert to consistent data structure
   - Apply any necessary conversions

3. **Perform calculations**
   - Execute primary analysis
   - Calculate derived metrics
   - Generate comparisons

4. **Interpret results**
   - Apply domain expertise
   - Compare to benchmarks
   - Identify notable patterns

## Output Format

Structured results including:
- **Calculated values:** Primary metrics with units
- **Benchmarks:** Comparisons to standards (when available)
- **Trends:** Historical or comparative analysis
- **Interpretations:** Domain-specific insights
- **Formatted report:** Excel/PDF with visualizations

## Scripts

- `process_data.py`: Main data processing engine
- `validate_input.py`: Input validation and sanitization
- `calculate_metrics.py`: Core calculations
- `generate_report.py`: Output formatting
```

### Examples Using This Pattern

- Financial ratio analysis
- Scientific data analysis
- Statistical processing
- Data quality assessment

---

## Pattern 2: Standards Enforcement

**Use for:** Skills that enforce consistency (brand guidelines, coding standards, compliance checking)

### Characteristics

- Detailed specifications and rules
- Validation checklists
- Before/after examples
- Compliance verification

### Structure Template

```markdown
## Standards Overview

This skill enforces [domain] standards for consistent, compliant [outputs].

### Applicable To

- Document Type 1 (PowerPoint presentations)
- Document Type 2 (Excel workbooks)
- Document Type 3 (PDF reports)

## Standards Specifications

### Category 1: Visual Standards

**Color Palette:**
- **Primary Color**: #0066CC - Use for headers, CTAs
- **Secondary Color**: #003366 - Use for body text
- **Accent Color**: #28A745 - Use for success states
- **Never use:** Colors outside approved palette

**Typography:**
- **H1**: 32pt Bold Primary Font
- **H2**: 24pt Semibold Primary Font
- **Body**: 11pt Regular Primary Font
- **Minimum line spacing**: 1.15

### Category 2: Content Standards

**Tone and Voice:**
- Professional yet approachable
- Active voice preferred
- Sentence length <20 words
- Avoid jargon unless defined

**Required Elements:**
- Document title (top-right)
- Company logo (top-left)
- Page numbers (centered bottom)
- Date (bottom-right)

### Category 3: Format Standards

**Page Setup:**
- Size: Letter (8.5" × 11")
- Margins: 1" all sides
- Orientation: Portrait (unless exception)

**File Naming:**
- Format: `[Category]_[Title]_[Date]_[Version].ext`
- Example: `Report_Q4Analysis_2024-01-15_v2.pdf`

## Validation Checklist

Before finalizing, verify:

**Visual Compliance:**
- [ ] Colors match approved palette
- [ ] Fonts are from approved list
- [ ] Logo placement correct
- [ ] Spacing meets minimums

**Content Compliance:**
- [ ] Tone matches standards
- [ ] Required elements present
- [ ] Terminology consistent
- [ ] Grammar and style correct

**Format Compliance:**
- [ ] Page setup correct
- [ ] File named properly
- [ ] Metadata complete
- [ ] Quality standards met

## Scripts

- `apply_standards.py`: Automated standards application
- `validate_compliance.py`: Compliance verification
- `generate_report.py`: Compliance report generation
```

### Examples Using This Pattern

- Corporate brand guidelines
- Coding style enforcement
- Document formatting standards
- Regulatory compliance checking

---

## Pattern 3: Multi-Step Workflows

**Use for:** Skills that guide complex processes (project setup, analysis workflows, multi-stage operations)

### Characteristics

- Sequential phases with dependencies
- Clear success criteria for each phase
- Decision points and branching
- Progress tracking

### Structure Template

```markdown
## Workflow Overview

This skill guides you through [process name] in [X] phases.

**Total time:** Estimate
**Prerequisites:** What's needed before starting
**Outputs:** What you'll have when done

## Phase 1: Preparation

**Objective:** Set up environment and gather requirements

### Steps

1. **Gather inputs**
   - Item 1: Description and source
   - Item 2: Description and source
   - Item 3: Description and source

2. **Validate prerequisites**
   - [ ] Requirement 1 met
   - [ ] Requirement 2 met
   - [ ] Requirement 3 met

3. **Set up environment**
   - Action 1: Specific instructions
   - Action 2: Specific instructions

### Success Criteria

- [ ] All inputs collected
- [ ] Prerequisites validated
- [ ] Environment ready

**Next:** Proceed to Phase 2 only after all criteria met

## Phase 2: Execution

**Objective:** Perform main operations

### Steps

1. **Process data**
   - Substep 1: Details
   - Substep 2: Details
   - Substep 3: Details

2. **Generate outputs**
   - Output 1: Format and content
   - Output 2: Format and content

3. **Verify results**
   - Check 1: What to verify
   - Check 2: What to verify

### Decision Point

**If verification passes:** Proceed to Phase 3
**If issues found:** Return to step 1 with corrections

### Success Criteria

- [ ] Processing complete
- [ ] Outputs generated
- [ ] Results verified

## Phase 3: Finalization

**Objective:** Complete and deliver results

### Steps

1. **Format deliverables**
   - Apply formatting standards
   - Add documentation
   - Package for delivery

2. **Quality review**
   - [ ] Completeness check
   - [ ] Accuracy check
   - [ ] Format check

3. **Deliver and document**
   - Submit deliverables
   - Document process
   - Archive artifacts

### Success Criteria

- [ ] All deliverables complete
- [ ] Quality standards met
- [ ] Documentation finalized

## Troubleshooting

### Common Issues

**Issue 1: Problem description**
- Cause: What causes this
- Solution: How to fix
- Prevention: How to avoid

**Issue 2: Problem description**
- Cause: What causes this
- Solution: How to fix
- Prevention: How to avoid

## Scripts

- `phase1_setup.py`: Automates preparation phase
- `phase2_process.py`: Executes main operations
- `phase3_finalize.py`: Handles finalization
- `verify_phase.py`: Validates phase completion
```

### Examples Using This Pattern

- Project initialization workflows
- Data migration processes
- Analysis pipelines
- Deployment procedures

---

## Pattern 4: Reference and Lookup

**Use for:** Skills that provide quick reference information (API docs, formula references, terminology)

### Characteristics

- Organized by category or topic
- Searchable structure
- Quick access to specific information
- Minimal processing, maximum reference

### Structure Template

```markdown
## Quick Reference

Fast lookup for [domain] information.

### Category 1: [Name]

#### Item 1
**Description:** Brief explanation
**Usage:** When and how to use
**Example:** `concrete example`
**Related:** Links to related items

#### Item 2
**Description:** Brief explanation
**Usage:** When and how to use
**Example:** `concrete example`
**Related:** Links to related items

### Category 2: [Name]

#### Item 1
**Formula:** `mathematical or code formula`
**Parameters:**
- `param1`: Description and valid range
- `param2`: Description and valid range
**Returns:** What it produces
**Example:** Working example with values

## Common Combinations

Frequently used together:

**Combination 1: Use Case Name**
- Use Item A for: Purpose
- Then Item B for: Purpose
- Finally Item C for: Purpose

**Combination 2: Use Case Name**
- Start with Item X
- Apply Item Y
- Validate with Item Z

## Lookup Tables

### Table 1: [Name]

| Key | Value | Notes |
|-----|-------|-------|
| Entry 1 | Data | Context |
| Entry 2 | Data | Context |

### Table 2: [Name]

| Parameter | Range | Default | Description |
|-----------|-------|---------|-------------|
| Param 1 | 0-100 | 50 | Details |
| Param 2 | A-Z | A | Details |
```

### Examples Using This Pattern

- API reference documentation
- Formula and calculation guides
- Configuration references
- Terminology glossaries

---

## Choosing the Right Pattern

| If your skill... | Use this pattern |
|------------------|------------------|
| Processes data with calculations | Structured Data Processing |
| Enforces rules or standards | Standards Enforcement |
| Guides multi-step processes | Multi-Step Workflows |
| Provides reference information | Reference and Lookup |
| Combines multiple aspects | Mix patterns as needed |

## Mixing Patterns

Complex skills can combine patterns:

**Example: Financial Analysis Skill**

- **Primary:** Structured Data Processing (for calculations)
- **Secondary:** Reference and Lookup (for ratio definitions)
- **Tertiary:** Standards Enforcement (for report formatting)

**Structure:**

```markdown
## Capabilities
[List all capabilities across patterns]

## Financial Ratio Reference
[Reference pattern for definitions]

## Data Processing
[Structured data pattern for calculations]

## Report Standards
[Standards enforcement for outputs]
```

## Resources

- See `examples/` directory for complete skill examples using these patterns
- Refer to `templates/` for starting templates
- Check `reference/best-practices.md` for quality guidelines
