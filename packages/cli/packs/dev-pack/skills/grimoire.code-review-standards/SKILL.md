---
name: grimoire.code-review-standards
description: "Shared methodology for systematic code review — a severity-prioritized criteria framework, a deterministic quality rating system, and a standard report format. Use when reviewing code changes for quality, security, performance, and maintainability. Triggers: code review, review my code, review changes, quality rating, review report, severity, critical issue."
---

# Code Review Standards

The shared methodology every code review follows: how to work through a change, how to classify findings by severity, how to score the result deterministically, and how to format the report.

This skill is **language-neutral**. The calling agent supplies the language scope, idiomatic naming conventions, language-specific criteria, and code examples. Layer those on top of the framework below.

## Review Process

1. **Identify changes**
   - Run `git diff` to see recent modifications
   - If no git repository, use `grep`/`glob` to find recently modified files
   - Focus the review on changed files only

2. **Contextual analysis**
   - Read surrounding code to understand the change context
   - Check project config files (`package.json`, `pyproject.toml`, `go.mod`, `Cargo.toml`, `.csproj`, etc.) for version and conventions
   - Review related files (interfaces, base classes, tests) to understand architectural patterns

3. **Execute the review** against the criteria below, in priority order.

## Severity-Prioritized Criteria

### CRITICAL (Must Fix — Security & Correctness)

- **Injection vulnerabilities** — SQL injection (use parameterized queries), XSS (unsanitized input rendered as HTML), command injection (unsanitized input to shell), path traversal (unvalidated file paths)
- **Hardcoded secrets** — API keys, passwords, tokens, connection strings in source; credentials committed to version control
- **Resource leaks** — unclosed file handles, database connections, network sockets; missing cleanup (`close()`, `dispose()`, `defer`, `with`, `using`, RAII)
- **Race conditions and concurrency bugs** — unprotected shared mutable state, missing synchronization, deadlock-prone patterns
- **Logic errors** — off-by-one, incorrect boolean logic, wrong comparison operators, unreachable code
- **Authentication and authorization gaps** — missing auth checks on protected endpoints, broken access control, insecure session management

### HIGH (Should Fix — Performance & Quality)

- **Performance anti-patterns** — N+1 query problems, unnecessary allocations in hot paths, synchronous I/O blocking an async runtime, inefficient algorithms where a better complexity class exists, missing caching for expensive repeated computation
- **Poor error handling** — swallowed exceptions/errors (empty catch blocks), catching overly broad exception types without re-raising, uninformative error messages, ignored returned errors
- **Code smells** — methods exceeding 50 lines, classes/modules with too many responsibilities (SRP violations), high cyclomatic complexity (> 10), duplicated code (DRY violations)

### MEDIUM (Consider Improving — Maintainability)

- **Naming conventions** — follow the language-idiomatic conventions supplied by the agent; descriptive names (avoid abbreviations like `mgr`, `svc`, `tmp`); consistent naming throughout
- **Modern language features** — current idioms over legacy patterns; leverage the type system (generics, union types, pattern matching); standard approaches over hand-rolled implementations
- **API design** — consistent return types and error-handling patterns, appropriate visibility modifiers, clear signatures (avoid excessive parameters)
- **Documentation** — public API documentation; comments explaining "why", not "what"

### LOW (Nice to Have — Polish)

- **Readability** — extract complex expressions into named variables; simplify nested conditionals with guard clauses / early returns; consistent formatting
- **Test coverage gaps** — missing tests for critical business logic, edge cases, or error paths

## Output Format

Structure feedback in this exact format:

```
## Code Review Summary

### Overview
[2-3 sentence summary of what was reviewed and general assessment]

**Language(s):** [Detected language(s) and framework(s)]
**Quality Rating:** X.X/10

**Rating Breakdown:**
- Security: [Deduct 2-3 points for each critical security issue]
- Correctness: [Deduct 1-2 points for logic errors, null/nil safety issues]
- Performance: [Deduct 0.5-1 point for significant performance problems]
- Maintainability: [Deduct 0.5-1 point for poor organization, naming, duplication]
- Best Practices: [Add 0.5-1 point for excellent use of modern language features]

### 🔴 CRITICAL Issues (Must Fix)
- **File:Line**: `filename.ext:42`
- **Issue**: [Clear description]
- **Risk**: [Why this is dangerous]
- **Fix**: [Specific code example showing the correction]

### 🟡 HIGH Priority (Should Fix)
[Same format as above]

### 🟢 MEDIUM Priority (Consider Improving)
[Same format as above]

### 💡 Suggestions (Nice to Have)
[Brief bullet points, no code examples needed]

### ✅ Positive Observations
[Highlight good practices you noticed — this is important for learning]
```

## Deterministic Quality Rating System

Calculate the rating using this decision tree so scores are fair and reproducible.

**Step 1: Count issues by severity** — Critical: C, High: H, Medium: M

**Step 2: Apply the decision tree**

```
IF C > 0 (any critical issues exist):
  ├─ IF C >= 3: Rating = 2.0-3.9 (Category: POOR)
  ├─ IF C == 2: Rating = 4.0-4.9 (Category: NEEDS SIGNIFICANT WORK)
  └─ IF C == 1:
      ├─ IF H >= 3: Rating = 5.0-5.9 (Category: NEEDS WORK)
      └─ ELSE: Rating = 6.0-6.9 (Category: ACCEPTABLE)

ELSE IF H > 0 (no critical, but high priority issues exist):
  ├─ IF H >= 5: Rating = 6.0-6.9 (Category: ACCEPTABLE)
  ├─ IF H >= 3: Rating = 7.0-7.9 (Category: GOOD)
  └─ IF H <= 2:
      ├─ IF M >= 5: Rating = 7.5-8.4 (Category: GOOD)
      └─ ELSE: Rating = 8.5-9.4 (Category: VERY GOOD)

ELSE (no critical or high priority issues):
  ├─ IF M >= 5: Rating = 8.0-8.9 (Category: VERY GOOD)
  ├─ IF M >= 2: Rating = 9.0-9.4 (Category: EXCELLENT)
  └─ IF M == 0: Rating = 9.5-10.0 (Category: OUTSTANDING)
```

**Step 3: Apply bonus adjustment (optional)** — within a rating range, choose the higher end when the code uses modern language features excellently, the architecture/design is outstanding, or test coverage is comprehensive.

**Category Definitions:**

- **10.0 (OUTSTANDING)**: Zero issues found. Perfect code.
- **9.0-9.4 (EXCELLENT)**: Only 1-2 minor medium-priority issues. Production-ready.
- **8.5-8.9 (VERY GOOD)**: No critical/high issues, 3-4 medium issues. Ready for production.
- **8.0-8.4 (VERY GOOD)**: No critical/high issues, 5+ medium issues. Minor cleanup needed.
- **7.5-7.9 (GOOD)**: 1-2 high-priority issues, well-structured otherwise.
- **7.0-7.4 (GOOD)**: 3-4 high-priority issues. Needs improvements before production.
- **6.0-6.9 (ACCEPTABLE)**: 1 critical OR 5+ high-priority issues. Requires fixes.
- **5.0-5.9 (NEEDS WORK)**: 1 critical + 3+ high issues. Significant refactoring needed.
- **4.0-4.9 (NEEDS SIGNIFICANT WORK)**: 2 critical issues. Major security/correctness concerns.
- **2.0-3.9 (POOR)**: 3+ critical issues. Not suitable for production.

**Output the rating like this:**

```
**Quality Rating:** 7.5/10 (Category: GOOD)
- Critical Issues: 0
- High Priority: 2
- Medium Priority: 3
```

## Constraints

- **Be specific**: always provide file names and line numbers.
- **Show, don't tell**: include code examples for fixes, not just descriptions.
- **Prioritize**: lead with critical security and correctness issues.
- **Be encouraging**: include at least one positive observation if the code has any good practices.
- **Stay focused**: review only what changed, not the entire codebase.
- **Be consistent with ratings**: use the rating system above for fair, reproducible scores.

## Tone

- Professional but friendly
- Direct about problems, but constructive
- Use technical terms correctly (the user is an experienced developer)
- Avoid condescending language
- Celebrate good practices when you see them
