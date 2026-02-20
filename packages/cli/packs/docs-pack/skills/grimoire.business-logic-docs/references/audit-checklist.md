# Audit Checklist

Use this checklist with [Workflow 3 — Audit Knowledge Base](../SKILL.md#workflow-3--audit-knowledge-base).

## Code Alignment Checks

Only perform when the user explicitly requests code comparison.

- [ ] Every "Enforced in" reference points to a file/class/function that still exists
- [ ] Mermaid state diagrams match actual state transitions in code
- [ ] Entity attributes listed in docs match the current schema/model definitions
- [ ] Integration contracts (endpoints, payloads) match actual API implementations
- [ ] Decision trees match actual conditional logic in code

Present findings as questions, not assertions. Example: "This code seems to enforce X, but it's not documented — is this a business rule that should be captured?"

## Content Quality Checks

- [ ] Every business rule has a "Why" explanation
- [ ] Critical rules (invariants, constraints) have counterexamples
- [ ] No unconfirmed `[SOURCE: code-audit — unconfirmed]` markers older than 30 days
- [ ] Decision trees exist for multi-branch logic (3+ paths)
- [ ] Constraints section populated with MUST / MUST NOT items
- [ ] Examples use concrete values, not abstract descriptions

## Structural Checks

- [ ] Table of Contents in `_overview.md` lists all Tier 2 files
- [ ] Each Tier 2 file has all template sections (even if marked TODO)
- [ ] Glossary terms in `_overview.md` are consistent across all files
- [ ] No business rules duplicated across multiple Tier 2 files
- [ ] All `<!-- TODO -->` markers reviewed — resolve or confirm still pending
- [ ] Decision log entries reference correct Tier 2 files in "Affected areas"

## Terminology Consistency Check

For each term in the glossary:

1. Search all Tier 2 files for the term
2. Search for common synonyms or abbreviations
3. Flag any file that uses a synonym instead of the glossary term
4. Check that the term's definition still matches how it's used in context

Report format:

| Term | Expected | Found | File | Line |
|---|---|---|---|---|
| `[glossary term]` | `[glossary term]` | `[synonym found]` | `[file]` | `[line]` |
