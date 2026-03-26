---
name: grimoire.business-logic-docs
description: "Create, update, and audit structured business logic documentation for AI assistants and developers. Use when documenting business rules, domain knowledge, invariants, workflows, state machines, entity relationships, decision logs, building a business logic knowledge base, or reviewing docs for staleness."
---

# Business Logic Documentation

Guide Claude through creating, updating, and auditing a structured knowledge base of a project's business logic. The knowledge base serves two audiences: AI coding assistants (so they understand domain context and make better decisions) and human developers (so they can recall and reason about business rules).

All generated documentation lives in `docs/business-logic/` by default. Ask the developer if they prefer a different path before generating.

**Core principle: business rules drive code, not vice versa.** Business logic documentation captures decisions that drive code changes — not descriptions of what code does. The flow is always: business decision → documentation → code implementation.

## Workflow 1 — Create the Initial Knowledge Base

Use this when a project has no business logic docs yet.

### Step 1: Discover Domain Areas

Examine the codebase to identify bounded contexts:

- **Folder structure**: Top-level directories, module boundaries, feature folders
- **Entity names**: Database models, domain classes, type definitions
- **Route groupings**: API endpoints, controller organization
- **Naming patterns**: Prefixes/suffixes that suggest domain separation (e.g., `order-`, `payment-`, `inventory-`)

Produce a preliminary list of domain areas and share it with the developer for confirmation before proceeding.

### Step 2: Interview the Developer

Surface business rules that aren't obvious from code alone. Ask focused questions in small batches (3-5 at a time) to avoid overwhelming. Prioritize:

1. **Domain terminology** — "What terms does your team use that have precise meanings? Any terms that are commonly confused?"
2. **User roles and permissions** — "What roles exist, and what can each role do or not do?"
3. **Critical invariants** — "What must always be true? What must never happen?"
4. **Hard constraints** — "What things MUST NEVER happen in the system? What would cause the most damage if violated?"
5. **Non-obvious edge cases** — "What scenarios have caused bugs or confusion before?"
6. **Regulatory or legal rules** — "Are any business rules driven by compliance requirements?"

After each batch of answers, ask follow-up questions if something needs clarification. Move to the next domain area once coverage feels sufficient.

### Step 3: Generate the Documentation

Create the three-tier structure described below. For each domain area identified:

1. Create the Tier 2 file using the template from [references/tier2-template.md](references/tier2-template.md)
2. Fill in what you learned from the interview. For rules surfaced from code analysis (not confirmed by the developer), mark with `[SOURCE: code-audit — unconfirmed]` — these MUST be confirmed before being treated as business rules.
3. Mark sections where information is incomplete with `<!-- TODO: clarify with team -->`

Then create the `_overview.md` (Tier 1) and `_decision-log.md` (Tier 3) files.

### Step 4: Integrate with CLAUDE.md

Add a reference to the knowledge base in the project's `CLAUDE.md` (create one if it doesn't exist). See [CLAUDE.md Integration](#claudemd-integration) below.

## Workflow 2 — Update the Existing Knowledge Base

Use this when business logic changes. Updates are driven by text input — user stories, change requests, discussion transcripts/summaries — not by code analysis.

### Step 0: Triage the Input

When the input is unstructured (meeting notes, transcripts, raw discussions), classify each item before proceeding:

- **Business rule/constraint** — what the system MUST or MUST NOT allow → document these
- **UX/presentation decision** — how something is displayed or interacted with → skip. Document only if the UX element is the mechanism that enforces a business constraint (e.g., a button is disabled because the system MUST NOT allow editing after dispatch). The constraint itself is the business rule; the UI mechanism is just implementation detail noted in "Enforced in."
- **Feature request / planned capability** — something that doesn't exist yet → skip, not documentation material
- **Scope / phase decision** — what's included in or deferred from a release phase → skip, this is project management, not a business rule
- **Action item / tangent** — not documentation material → skip

**Litmus test:** Would violating this item cause incorrect data, broken invariants, security holes, or compliance violations? If the only consequence is a suboptimal user experience, it's a UX decision, not a business rule.

Examples:
- "Users must not edit shipments after dispatch" → Business rule (data integrity)
- "Items should not be pre-selected by default" → UX decision (no data/integrity consequence)
- "Use 'Next' instead of 'Save' on wizard buttons" → UX decision (label preference)
- "Save as Draft is deferred to phase 2" → Scope decision (skip)
- "One shipment = one dock in MQS" → Business rule (hard system mapping)
- "Create Shipment from Orders List needed" → Feature request (skip)

Present the classification as a table for the user to confirm before proceeding:

| Item | Classification | Reason | Action |
|------|---------------|--------|--------|
| ... | Business rule / UX / Feature / Scope / Tangent | Why this classification | Document / Skip |

For well-structured input (user stories with clear acceptance criteria, formal change requests), this step can be brief or skipped.

### Step 1: Understand the Change

Read the provided input (user story, change request, discussion transcript/summary). Extract:

- What business rules are being added, modified, or removed
- Which domain area(s) and Tier 2 file(s) are affected

Do NOT look at code to infer business rules — the provided input is the single source of truth. If the input is ambiguous or incomplete, ask the user for clarification before proceeding.

### Step 2: Review Existing Documentation

Read the affected Tier 2 file(s). For each change from Step 1, check:

- Does it contradict any existing rule?
- Does it modify an existing rule or add a new one?
- Does it affect workflows, entities, or integration points?
- Does it invalidate any existing constraints, examples, or counterexamples?
- **Terminology cross-reference**: Does the input use different terms for concepts already documented? Flag mismatches to the user (e.g., "The transcript says 'Dispatched' — does this map to the existing 'InTransit' status in the docs?"). Check the glossary in `_overview.md` and entity names in affected Tier 2 files.

Flag any conflicts or ambiguities to the user before making changes.

### Step 3: Clarify Uncertainties

If anything from the input is unclear, contradicts existing docs, or leaves gaps, ask the user targeted questions. Examples:

- "The user story says X, but the current docs say Y — which is correct?"
- "This change implies Z — is that intended?"
- "Are there edge cases for this new rule?"
- "Does this replace the existing rule or add a new exception?"

NEVER proceed with uncertain information. NEVER fill gaps by guessing from code.

### Step 4: Apply the Updates

Only add information you are certain about from the provided input.

- **Modified rules**: Replace the old rule with the new one. Don't annotate what changed — git tracks history.
- **New rules**: Use the template format from [references/tier2-template.md](references/tier2-template.md). Include Source marker.
- **Removed rules**: Delete them. Only keep a note about the removal if it carries business context that other rules depend on (e.g., "we no longer support gift cards" is useful if other rules reference gift cards).
- **New domain areas**: Create a new Tier 2 file and add it to the table of contents in `_overview.md`.
- **"Enforced in" fields**: Leave empty or mark with `<!-- TODO: add code location after implementation -->` — code locations are filled in after implementation, not before.
- **Diagrams and glossary**: Update as needed to reflect changes.
- **Feature requests**: MUST NOT be added to business logic docs. If the input contains feature requests or planned capabilities, exclude them and mention to the user what was excluded and why.
- **UX-only decisions**: Do not document in business logic docs unless they enforce a business constraint (e.g., a disabled button that prevents an invalid state transition is a constraint; a button label rename is not).
- **Scope/phase annotations**: Do not add "deferred to phase 2" or "planned for future release" annotations. Business logic docs describe what IS true now, not what's planned. If a capability doesn't exist yet, there's nothing to document.
- **Template compliance**: Do NOT invent new template sections. Only use sections defined in [references/tier2-template.md](references/tier2-template.md). If information doesn't fit an existing section, it likely doesn't belong in business logic docs.

### Step 5: Validate and Present

Verify:

- No contradictions introduced across files
- Diagrams reflect the changes
- Table of contents is accurate
- Terminology is consistent with the glossary
- Decision log entry added if the change involves a non-obvious decision

Present a summary to the user showing exactly what was changed and why, so they can confirm accuracy.

## Workflow 3 — Audit Knowledge Base

Use only when the user explicitly requests an audit or review of existing documentation.

This is the one workflow where code comparison is appropriate — but only to flag potential gaps, never to infer new business rules.

### Step 1: Review Documentation Completeness

Check for structural issues using [references/audit-checklist.md](references/audit-checklist.md):

- Unresolved `<!-- TODO -->` markers
- Empty or placeholder sections
- Rules missing "Why" explanations
- Critical rules without counterexamples
- Constraints section empty or missing

### Step 2: Check Code Alignment

**Only when the user explicitly asks to compare docs against code.** Check:

- "Enforced in" references still point to existing code
- State diagram transitions match actual code behavior
- Entity attributes match current schema

Flag undocumented code behavior as questions, not assertions: "This code seems to enforce X, but it's not documented — is this a business rule that should be captured?" Mark any rules surfaced this way with `[SOURCE: code-audit — unconfirmed]`.

### Step 3: Check Terminology Consistency

- Extract all glossary terms from `_overview.md`
- Search Tier 2 files for inconsistent usage (synonyms, abbreviations, variant spellings)
- Report inconsistencies in the format described in [references/audit-checklist.md](references/audit-checklist.md)

### Step 4: Produce Audit Report

Structured output with sections:

1. **Incomplete Items** — Missing Why, missing examples, empty sections, unresolved TODOs
2. **Terminology Issues** — Inconsistent term usage across files
3. **Structural Issues** — ToC mismatches, missing template sections, duplicated rules
4. **Potential Documentation Gaps** *(only if Step 2 was performed)* — Code behavior not reflected in docs

Ask the developer to review and confirm before making any changes.

## Three-Tier Documentation Structure

### Tier 1 — `_overview.md`

The entry point. Contains:

- **Business summary**: 2-3 paragraphs — enough for a newcomer to orient.
- **Glossary**: Domain terms with precise definitions. This prevents AI and humans from confusing terms.
- **User roles**: Each role's capabilities and restrictions.
- **Domain area map**: High-level view of how domain areas relate to each other. Use a mermaid diagram if relationships are non-trivial.
- **Table of contents**: Links to every Tier 2 file.

### Tier 2 — One File Per Domain Area

E.g., `orders.md`, `payments.md`, `inventory.md`. Each follows the template in [references/tier2-template.md](references/tier2-template.md). Key sections:

- **Purpose** — What this area does and why it exists.
- **Key Entities** — Core entities, attributes, relationships. Use mermaid for non-trivial relationships.
- **Constraints** — The highest-value content. MUST and MUST NOT rules with business reasons.
- **Business Rules & Invariants** — Each rule states: what the rule is, why it exists (the business reason), where it's enforced in code, a concrete example including an edge case, and for critical rules a counterexample.
- **Workflows & State Transitions** — Key processes with mermaid state diagrams for anything with 3+ states. Specify triggers and validations.
- **Decision Trees** — Sequential if-then format for multi-branch conditional logic.
- **Integration Points** — External systems, APIs, other domain areas. Note contracts and assumptions.
- **Edge Cases & Known Gotchas** — Non-obvious behaviors that have caused bugs or confusion.

### Tier 3 — `_decision-log.md`

A chronological record of non-obvious business decisions. Append-only — new entries go at the top, old entries are never edited. If a decision is reversed, add a new entry referencing the original.

Each entry follows:

```markdown
## YYYY-MM-DD — [Short title]
**Context:** What situation prompted this decision.
**Decision:** [Chosen option] because [justification], to achieve [desired outcome], accepting [tradeoff].
**Alternatives considered:** What else was evaluated and why it was rejected.
**Affected areas:** Which Tier 2 files are impacted.
```

**Threshold for a decision log entry** — only add an entry when:

- The decision involves a non-obvious tradeoff where rejected alternatives had real consequences
- Future developers might question or accidentally reverse the decision
- The "why" is not self-evident from the rule itself

Do NOT add decision log entries for: UI label changes, default value tweaks, deferred features without evaluated alternatives, or any decision where there was no meaningful alternative considered.

## Writing Principles

Follow these when writing or updating business logic docs:

1. **Write for reasoning, not just reading.** Always include the "why" behind a rule. Instead of "Users can't delete invoices," write "Users can't delete invoices because downstream accounting reconciliation depends on invoice immutability. Soft-delete via `deleted_at` is used instead." The causal chain enables correct inferences.

2. **Be explicit about invariants.** Things that must always or never be true are the highest-value content. Call them out prominently in the Constraints section of every domain area file.

3. **Link business concepts to code landmarks.** Don't describe implementation details, but do say "Order state transitions are enforced in `OrderStateMachine` — never manipulate `order.status` directly." This bridges conceptual and concrete.

4. **Use concrete examples over abstract rules.** Instead of "discounts are applied hierarchically," show: "A user with a 10% loyalty discount buying a product with a 20% sale: sale price first ($100 -> $80), then loyalty ($80 -> $72). Total discount is 28%, not 30%."

5. **Prefer mermaid diagrams for state machines and entity relationships.** They're diffable in PRs, render in GitHub, and Claude can read and generate them.

6. **Don't duplicate what git tracks.** No version headers, no changelogs inside docs. The decision log is the sole exception because chronological "why" context is its purpose.

7. **Group by domain area, not by technical layer.** Everything about orders (validation, state machine, permissions, integrations) goes in `orders.md`, not split across "validations.md" and "permissions.md".

8. **Constraints before capabilities.** Document what MUST NOT happen before documenting what should happen. Use explicit RFC-2119 language (MUST, MUST NOT, SHOULD, SHOULD NOT) for rules that carry enforcement weight.

9. **Include counterexamples for critical rules.** For every invariant and constraint, show the wrong behavior and why it fails. Format: what the correct behavior is, what the incorrect behavior looks like, and why it matters.

10. **Use decision trees for complex conditional logic.** Any logic with 3+ branches MUST use sequential if-then format. Mark mutually exclusive paths explicitly. No prose-only descriptions for multi-branch logic.

11. **Mark information sources.** Tag rules with their origin using the format `[SOURCE: type — YYYY-MM-DD]` when a date is available: e.g., `[SOURCE: user-story — 2025-01-15]`, `[SOURCE: discussion — 2025-02-10]`. The date is optional — omit the suffix when no date is explicitly provided (e.g., `[SOURCE: change-request]` is fine). During audits (Workflow 3 only), rules surfaced from code analysis get `[SOURCE: code-audit — unconfirmed]` and MUST be confirmed with the user before being treated as business rules. Incorrect docs are worse than missing docs.

12. **State machines over prose for workflows.** Any process with 3+ states MUST use a mermaid stateDiagram plus a transition table. No prose-only workflow descriptions for stateful processes.

## Documentation Clarity

Docs describe the current state, not history:

- When a rule changes, **replace it** — don't annotate what it used to be. Git tracks history.
- No "previously was", "changed from X to Y", "before it was" language.
- Remove rules that no longer apply. Only keep a note about the removal if it carries business context other rules depend on (e.g., "we no longer support gift cards" is useful if other rules reference gift cards).
- Use `<!-- TODO -->` markers only for genuinely incomplete information that needs user input.
- Every statement in the docs should describe what IS true right now.

## ALWAYS / NEVER

### ALWAYS

- ALWAYS confirm the output path before generating files
- ALWAYS include "Why" for every rule and constraint
- ALWAYS ask for clarification when input is ambiguous or incomplete
- ALWAYS verify new information doesn't contradict existing rules
- ALWAYS present a summary of all changes for user confirmation
- ALWAYS update the Table of Contents when files are added or removed
- ALWAYS add a decision log entry for non-obvious changes
- ALWAYS leave "Enforced in" empty when the code location is unknown

### NEVER

- NEVER guess or infer business rules from code — business rules drive code, not vice versa
- NEVER add information you are not certain about
- NEVER proceed when the input contradicts existing documentation — ask first
- NEVER reverse-engineer business rules from code changes unless the user explicitly requests it
- NEVER use "previously was" / "changed from X to Y" / history annotations — docs describe current state, git tracks history
- NEVER leave diagrams contradicting documented transitions
- NEVER duplicate rules across files — reference the canonical location instead
- NEVER add feature requests, roadmap items, or planned capabilities to business logic docs — these are not current-state business rules
- NEVER invent template sections not defined in `tier2-template.md`

## CLAUDE.md Integration

Add (or update) the following section in the project's `CLAUDE.md`:

```markdown
## Business Logic Documentation
Before modifying business logic, read the relevant file in `docs/business-logic/`.
When your changes affect business rules, update the corresponding doc in the same commit.
If no file exists for the domain area, create one following the structure of existing files.
Start with `docs/business-logic/_overview.md` for domain orientation.
Rules marked `[SOURCE: code-audit — unconfirmed]` need human confirmation before relying on them.
```

If the developer chose a custom docs path, adjust the paths accordingly.

## Limitations

- This skill provides guidance for creating documentation, not executable code.
- The knowledge base captures business rules at a point in time — it requires human input for rules that aren't visible in code.
- Rules inferred from code (`[SOURCE: code-audit — unconfirmed]`) require human verification before they should be treated as authoritative business rules.
- Mermaid diagrams may not render in all environments (they work in GitHub, VS Code, and most modern markdown viewers).
- The decision log is only as valuable as the team's discipline in maintaining it.
