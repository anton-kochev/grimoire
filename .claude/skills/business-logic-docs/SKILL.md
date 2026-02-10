---
name: business-logic-docs
description: "Create and maintain structured business logic documentation for AI assistants and developers. Use when documenting business rules, domain knowledge, invariants, workflows, state machines, entity relationships, decision logs, or building a business logic knowledge base."
---

# Business Logic Documentation

Guide Claude through creating and maintaining a structured knowledge base of a project's business logic. The knowledge base serves two audiences: AI coding assistants (so they understand domain context and make better decisions) and human developers (so they can recall and reason about business rules).

All generated documentation lives in `docs/business-logic/` by default. Ask the developer if they prefer a different path before generating.

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
4. **Non-obvious edge cases** — "What scenarios have caused bugs or confusion before?"
5. **Regulatory or legal rules** — "Are any business rules driven by compliance requirements?"

After each batch of answers, ask follow-up questions if something needs clarification. Move to the next domain area once coverage feels sufficient.

### Step 3: Generate the Documentation

Create the three-tier structure described below. For each domain area identified:

1. Create the Tier 2 file using the template from [references/tier2-template.md](references/tier2-template.md)
2. Fill in what you learned from code analysis and the interview
3. Mark sections where information is incomplete with `<!-- TODO: clarify with team -->`

Then create the `_overview.md` (Tier 1) and `_decision-log.md` (Tier 3) files.

### Step 4: Integrate with CLAUDE.md

Add a reference to the knowledge base in the project's `CLAUDE.md` (create one if it doesn't exist). See [CLAUDE.md Integration](#claudemd-integration) below.

## Workflow 2 — Update the Existing Knowledge Base

Use this when business logic changes.

1. **Identify the affected domain area.** Determine which Tier 2 file(s) need updating.
2. **Update in place.** Edit the corresponding file directly. Do not keep old versions in the doc — git handles history.
3. **Log non-obvious decisions.** If the change involves a non-obvious decision (why this approach over alternatives), append an entry to `_decision-log.md`.
4. **New domain areas.** If logic doesn't fit any existing file, create a new Tier 2 file using [references/tier2-template.md](references/tier2-template.md) and add it to the table of contents in `_overview.md`.
5. **Deprecated logic.** Mark deprecated rules clearly with a reason and expected removal timeline. Do not delete until the code is cleaned up:
   ```markdown
   - **Rule**: ~~Users can pay with gift cards.~~
     **DEPRECATED (2025-03-01):** Gift card support removed in v3.0. Code cleanup tracked in PROJ-1234. Remove this entry after cleanup.
   ```

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
- **Business Rules & Invariants** — The most critical section. Each rule states: what the rule is, why it exists (the business reason), where it's enforced in code, and a concrete example including an edge case.
- **Workflows & State Transitions** — Key processes with mermaid state diagrams for anything with 3+ states. Specify triggers and validations.
- **Integration Points** — External systems, APIs, other domain areas. Note contracts and assumptions.
- **Edge Cases & Known Gotchas** — Non-obvious behaviors that have caused bugs or confusion.

### Tier 3 — `_decision-log.md`

A chronological record of non-obvious business decisions. Append-only — new entries go at the top, old entries are never edited. If a decision is reversed, add a new entry referencing the original.

Each entry follows:

```markdown
## YYYY-MM-DD — [Short title]
**Context:** What situation prompted this decision.
**Decision:** What was decided.
**Alternatives considered:** What else was evaluated and why it was rejected.
**Affected areas:** Which Tier 2 files are impacted.
```

## Writing Principles

Follow these when writing or updating business logic docs:

1. **Write for reasoning, not just reading.** Always include the "why" behind a rule. Instead of "Users can't delete invoices," write "Users can't delete invoices because downstream accounting reconciliation depends on invoice immutability. Soft-delete via `deleted_at` is used instead." The causal chain enables correct inferences.

2. **Be explicit about invariants.** Things that must always or never be true are the highest-value content. Call them out prominently in every domain area file.

3. **Link business concepts to code landmarks.** Don't describe implementation details, but do say "Order state transitions are enforced in `OrderStateMachine` — never manipulate `order.status` directly." This bridges conceptual and concrete.

4. **Use concrete examples over abstract rules.** Instead of "discounts are applied hierarchically," show: "A user with a 10% loyalty discount buying a product with a 20% sale: sale price first ($100 -> $80), then loyalty ($80 -> $72). Total discount is 28%, not 30%."

5. **Prefer mermaid diagrams for state machines and entity relationships.** They're diffable in PRs, render in GitHub, and Claude can read and generate them.

6. **Don't duplicate what git tracks.** No version headers, no changelogs inside docs. The decision log is the sole exception because chronological "why" context is its purpose.

7. **Group by domain area, not by technical layer.** Everything about orders (validation, state machine, permissions, integrations) goes in `orders.md`, not split across "validations.md" and "permissions.md".

## CLAUDE.md Integration

Add (or update) the following section in the project's `CLAUDE.md`:

```markdown
## Business Logic Documentation
Before modifying business logic, read the relevant file in `docs/business-logic/`.
When your changes affect business rules, update the corresponding doc in the same commit.
If no file exists for the domain area, create one following the structure of existing files.
Start with `docs/business-logic/_overview.md` for domain orientation.
```

If the developer chose a custom docs path, adjust the paths accordingly.

## Limitations

- This skill provides guidance for creating documentation, not executable code.
- The knowledge base captures business rules at a point in time — it requires human input for rules that aren't visible in code.
- Mermaid diagrams may not render in all environments (they work in GitHub, VS Code, and most modern markdown viewers).
- The decision log is only as valuable as the team's discipline in maintaining it.
