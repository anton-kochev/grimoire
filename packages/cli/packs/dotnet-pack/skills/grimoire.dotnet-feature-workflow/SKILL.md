---
name: grimoire.dotnet-feature-workflow
description: "Orchestrates end-to-end .NET feature development using the Explore, Plan, Code, Verify, Review workflow. Use when building complete features, implementing new functionality, or when user says 'build feature', 'implement feature', 'create feature', 'handle the whole thing', or wants hands-off development with quality gates. Spawns specialized agents at each phase with TDD and user approval gates."
user-invokable: true
disable-model-invocation: true
version: 1.0.0
---

# .NET Feature Development Workflow

This skill orchestrates complete .NET feature development by coordinating specialized agents through a structured workflow with quality gates.

## Workflow Overview

```plain
EXPLORE → PLAN → [USER APPROVAL] → CODE (TDD) → VERIFY → REVIEW
```

| Phase | Agent | Purpose |
| ------- | ------- | --------- |
| 1. Explore | `Explore` | Understand codebase context |
| 2. Plan | `dotnet-architect` | Design the solution |
| 3. Approve | User | Gate before implementation |
| 4. Code | `csharp-coder` | TDD implementation |
| 5. Verify | (direct) | Build and test |
| 6. Review | `csharp-code-reviewer` | Quality assessment |

## How to Use This Workflow

When the user requests a complete feature, follow these phases in order.

### Phase 1: Explore

**Goal**: Gather codebase context. Do NOT write code.

Spawn the `Explore` agent (Task tool, subagent_type: `Explore`) with:

- Feature requirements from the user
- Thoroughness: "medium" or "very thorough"
- Instructions to investigate:
  - Project structure and existing patterns
  - Related domain entities and services
  - Test conventions
  - CLAUDE.md guidelines
  - Where the feature fits architecturally
  - Dependencies and integration points

Capture output as **Context Summary** for Phase 2.

### Phase 2: Plan

**Goal**: Design the solution. Do NOT implement yet.

Spawn `dotnet-architect` agent with:

- Feature requirements
- Context Summary from Phase 1
- Request for comprehensive design:
  - Domain entities and value objects
  - Application services and interfaces
  - API contracts and DTOs
  - Test strategy and test cases
  - File structure and naming

Present the plan to the user:

```plain
===== PROPOSED PLAN =====

[Architect's design output]

=========================

Please review. Reply with:
- "approve" or "proceed" to start implementation
- Your feedback if changes are needed
```

**STOP. Do NOT proceed until user explicitly approves.**

### Phase 3: Code (TDD)

**Goal**: Implement with tests first.

**Step 3a - Tests**: Spawn `csharp-coder` agent to write unit tests based on the approved design. Cover happy paths, edge cases, error conditions.

**Step 3b - Implementation**: Spawn `csharp-coder` agent to implement the solution, making all tests pass.

### Phase 4: Verify

**Goal**: Ensure build and tests pass.

**If failures occur**:

- Analyze errors
- Use `csharp-coder` agent to fix
- Repeat (max 3 attempts)

**Do NOT proceed until build succeeds and tests pass.**

### Phase 5: Review

**Goal**: Final quality assessment.

Spawn `csharp-code-reviewer` agent with:

- All files created/modified
- Review criteria: SOLID principles, security, performance, design adherence

Present review findings to user.

### Phase 6: Summary

Provide final summary:

- Context gathered (Explore findings)
- Architectural decisions (Plan highlights)
- Implementation (files created/modified)
- Verification results (build + test status)
- Review findings
- Suggested next steps

## Required Agents

Before starting, verify these agents exist:

- `dotnet-architect` - Solution design
- `csharp-coder` - Implementation
- `csharp-code-reviewer` - Code review

Check with: `ls -la ~/.claude/agents/` and `ls -la .claude/agents/`

If agents are missing, inform the user before proceeding.

## Error Handling

| Phase | On Failure |
| ------- | ------------ |
| Explore | Report issues; ask user for guidance |
| Plan | STOP and report |
| Approval | Wait for explicit approval |
| Code | Report what failed; don't proceed |
| Verify | Fix with csharp-coder (max 3 attempts) |
| Review | Report but don't block completion |

## Key Principles

1. **Never skip the approval gate** - Always wait for explicit user approval after Plan phase
2. **TDD** - Write tests before implementation
3. **Incremental progress** - Report status after each phase
4. **Quality gates** - Don't proceed if build/tests fail
5. **Context passing** - Each agent receives relevant context from prior phases

## Example Invocation

User: "Build a user registration feature with email verification"

Response: "I'll follow the .NET feature development workflow to build this feature end-to-end. Starting with Phase 1: Explore..."

Then proceed through each phase, spawning appropriate agents and waiting for user approval after planning.
