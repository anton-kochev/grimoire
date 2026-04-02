---
name: grimoire.srs-to-user-stories
description: "Analyze a Software Requirements Specification (SRS) document and generate well-crafted Scrum user stories grouped under Epics. Use when the user wants to extract user stories from an SRS, convert requirements into a product backlog, break down a spec into stories, or turn a requirements document into actionable Scrum artifacts."
user_invocable: true
disable-model-invocation: true
---

# SRS to User Stories

> **User-executable skill** — invoke with `/grimoire.srs-to-user-stories`.

Analyze a Software Requirements Specification and produce a complete set of
Scrum user stories, organized under Epics, ready for backlog grooming.

## Input

The SRS can come from:
- An uploaded file (check `/mnt/user-data/uploads/` for markdown, text, or other
  readable formats). If it's a PDF or docx, use the appropriate reading skill first.
- Content already present in the conversation context.

If no SRS is found in either location, ask the user to provide one.

## Analysis Process

Work through the SRS in three passes:

### Pass 1 — Understand the domain

Read the full SRS and identify:
- The product or system being described
- The primary user roles / actors (these become the "As a ___" in stories)
- The major functional areas or feature groups (these become Epics)
- Non-functional requirements (performance, security, etc.) — these often
  produce their own stories or acceptance criteria on other stories

### Pass 2 — Extract and decompose requirements

For each requirement or feature in the SRS:
1. Determine which Epic it belongs to. Create new Epics when a requirement
   doesn't fit an existing group.
2. Break it into one or more user stories. A single SRS requirement often maps
   to multiple stories — split until each story is small enough to be completed
   in one sprint (follow the INVEST criteria below).
3. Identify dependencies between stories — note when one story must be
   completed before another can begin.

### Pass 3 — Quality check

Review every story against the INVEST criteria:
- **I**ndependent — Can be developed without depending on another story (if not,
  note the dependency explicitly)
- **N**egotiable — Describes the *what* and *why*, not the *how*
- **V**aluable — Delivers clear value to a user or stakeholder
- **E**stimable — Specific enough that a team could estimate it
- **S**mall — Completable within a single sprint
- **T**estable — Acceptance criteria are concrete and verifiable

If a story fails INVEST, split it further or revise it.

## Output Format

Present the results in chat using this structure:

```
# User Stories — [Product/System Name]

## Summary
- **Epics**: [count]
- **Total User Stories**: [count]
- **User Roles Identified**: [list of roles]

---

## Epic 1: [Epic Name]
> [One-sentence description of what this epic covers]

### Story 1.1: [Short descriptive title]
**As a** [user role],
**I want** [goal/desire],
**So that** [benefit/value].

**Acceptance Criteria:**
- [ ] [Criterion 1 — concrete, testable condition]
- [ ] [Criterion 2]
- [ ] ...

**Dependencies:** [Story X.Y] | None

---

### Story 1.2: [Title]
...

---

## Epic 2: [Epic Name]
...

---

## Identified Gaps & Ambiguities

| # | SRS Section / Requirement | Issue | Impact |
|---|---------------------------|-------|--------|
| 1 | [reference] | [what's unclear or missing] | [how it affects story completeness] |
| 2 | ... | ... | ... |

## Dependency Map

List any chains of dependencies here so the team can see the recommended
implementation order at a glance:

1. [Story X.Y] → [Story X.Z] → [Story A.B]
2. ...
```

## Important Guidelines

- Write acceptance criteria as concrete, testable conditions — not vague statements.
  Bad: "System should be fast." Good: "Page loads in under 2 seconds on a 3G connection."
- Each acceptance criterion should start with a checkbox `- [ ]` so teams can
  use them directly in their tooling.
- When the SRS mentions a non-functional requirement (performance, security,
  accessibility), either create a dedicated story for it or weave it into the
  acceptance criteria of the relevant functional stories — don't drop it silently.
- If the SRS uses vague language ("the system should handle many users",
  "data should be processed quickly"), flag it in the Gaps & Ambiguities table
  rather than inventing specific numbers.
- Keep story titles short but descriptive — they should make sense in a Kanban
  board column without needing to read the full story.
- Use consistent role names throughout. If the SRS uses multiple terms for the
  same actor, pick one and note the mapping.
- The Dependency Map should surface the critical path — the longest chain of
  dependent stories — so the team knows what to prioritize.
