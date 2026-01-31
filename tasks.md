# Skill Auto-Activation System - Implementation Tasks

## Overview

This document breaks down the Skill Auto-Activation System into atomic, TDD-friendly tasks. Each task follows the pattern: **Write tests → Implement → Refactor**.

**Language:** TypeScript
**Runtime:** Node.js (via tsx for direct execution)
**Package Manager:** pnpm
**Test Framework:** Vitest
**Target Location:** `.claude/hooks/skill-router.ts`

---

## Phase 1: Project Setup

### Task 1.1: Create Directory Structure

**Priority:** Must Have
**Estimated Complexity:** Trivial

Create the required directory structure:

```
.claude/
├── hooks/
│   └── skill-router.ts        # Main executable
├── logs/                       # Log output directory
└── skills-manifest.json        # Configuration file
src/
└── skill-router/
    ├── index.ts                # Entry point
    ├── types.ts                # Type definitions
    ├── normalize.ts            # Prompt normalization
    ├── signals.ts              # Signal extraction
    ├── scoring.ts              # Skill scoring
    ├── formatting.ts           # Output formatting
    ├── manifest.ts             # Manifest loading
    ├── logging.ts              # Log handling
    └── main.ts                 # Main execution flow
tests/
└── skill-router/
    ├── normalize.test.ts
    ├── signals.test.ts
    ├── scoring.test.ts
    ├── formatting.test.ts
    ├── manifest.test.ts
    ├── logging.test.ts
    └── integration.test.ts
```

**Acceptance Criteria:**

- [ ] `.claude/hooks/` directory exists
- [ ] `.claude/logs/` directory exists
- [ ] `src/skill-router/` directory exists
- [ ] `tests/skill-router/` directory exists
- [ ] Stub `skill-router.ts` created with shebang `#!/usr/bin/env npx tsx`

---

### Task 1.2: Set Up TypeScript & Test Infrastructure

**Priority:** Must Have
**Estimated Complexity:** Simple

Configure TypeScript, Vitest, and create test fixtures.

**Acceptance Criteria:**

- [ ] `package.json` with dependencies: `typescript`, `tsx`, `vitest`
- [ ] `pnpm-lock.yaml` generated
- [ ] `tsconfig.json` configured for Node.js (ES2022, NodeNext modules)
- [ ] `vitest.config.ts` configured
- [ ] Basic test fixture for sample manifest data
- [ ] Basic test fixture for sample hook input
- [ ] `pnpm test` runs without errors

**package.json scripts:**

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "build": "tsc",
    "router": "tsx .claude/hooks/skill-router.ts"
  }
}
```

---

### Task 1.3: Define Type Interfaces

**Priority:** Must Have
**Estimated Complexity:** Simple
**SRS Reference:** Section 5

Create TypeScript interfaces matching all SRS data structures.

**Acceptance Criteria:**

- [ ] `SkillManifest` interface (Section 5.1)
- [ ] `SkillConfig` interface with weights
- [ ] `SkillDefinition` interface with triggers
- [ ] `HookInput` interface (Section 5.2)
- [ ] `HookOutput` interface (Section 5.3)
- [ ] `ExtractedSignals` interface (Section 5.4.1)
- [ ] `SkillScoreResult` interface (Section 5.4.2)
- [ ] `LogEntry` interface (Section 5.5)
- [ ] All interfaces exported from `types.ts`

---

## Phase 2: Core Functions (Ordered by Dependency)

### Task 2.1: Implement `normalizePrompt()`

**Priority:** Must Have
**Estimated Complexity:** Simple
**SRS Reference:** Section 6.2

**TDD Steps:**

1. Write tests for:
   - Empty string → empty string
   - Whitespace only → empty string
   - Mixed case → lowercase
   - Punctuation removal (keeping dots, slashes)
   - Multiple spaces collapsed
   - Leading/trailing whitespace trimmed

2. Implement function matching algorithm in SRS 6.2

**Acceptance Criteria:**

- [ ] All edge cases tested
- [ ] Function handles unicode gracefully
- [ ] Performance: <1ms for 10,000 char input

---

### Task 2.2: Implement `extractSignals()`

**Priority:** Must Have
**Estimated Complexity:** Medium
**SRS Reference:** Section 6.3

**TDD Steps:**

1. Write tests for:
   - Word extraction (min 2 chars)
   - File extension extraction (`.pdf`, `.docx`, etc.)
   - Path extraction (`invoices/march.pdf`)
   - No matches case
   - Multiple matches case
   - Edge cases (dots in filenames, nested paths)

2. Implement function with regex patterns from SRS 6.3

**Acceptance Criteria:**

- [ ] Returns `ExtractedSignals` with `words` (Set), `extensions` (Set), `paths` (string[])
- [ ] Extensions include leading dot
- [ ] Paths preserve original casing for matching
- [ ] Performance: <1ms for 10,000 char input

---

### Task 2.3: Implement `scoreSkill()`

**Priority:** Must Have
**Estimated Complexity:** Medium
**SRS Reference:** Section 6.4

**Dependencies:** `extractSignals()` must be complete

**TDD Steps:**

1. Write tests for:
   - Keyword matching (case-insensitive)
   - File extension matching
   - Pattern matching (regex)
   - File path prefix matching
   - Combined scoring with weights
   - Invalid regex pattern handling (graceful skip)
   - No triggers defined (score 0)

2. Implement scoring algorithm from SRS 6.4

**Acceptance Criteria:**

- [ ] Returns `SkillScoreResult` with `skill`, `score`, `matchedSignals`
- [ ] Each match type uses correct weight
- [ ] Invalid regex logged and skipped, doesn't crash
- [ ] Path prefix match counts only once per prefix
- [ ] Performance: <0.5ms per skill

---

### Task 2.4: Implement `filterByThreshold()`

**Priority:** Must Have
**Estimated Complexity:** Trivial
**SRS Reference:** Section 6.5

**TDD Steps:**

1. Write tests for:
   - Empty results array
   - All below threshold
   - All above threshold
   - Boundary values (exactly at threshold)
   - Mixed results

2. Implement simple filter function

**Acceptance Criteria:**

- [ ] Returns only results where score >= threshold
- [ ] Original array not mutated
- [ ] Handles empty input gracefully

---

### Task 2.5: Implement `sortDescendingByScore()`

**Priority:** Must Have
**Estimated Complexity:** Trivial
**SRS Reference:** Section 6.5

**TDD Steps:**

1. Write tests for:
   - Already sorted
   - Reverse sorted
   - Ties (should sort by name alphabetically)
   - Empty array
   - Single item

2. Implement sorting function

**Acceptance Criteria:**

- [ ] Primary sort: score descending
- [ ] Secondary sort (tiebreaker): name ascending
- [ ] Stable sort for equal values
- [ ] Original array not mutated (returns new array)

---

### Task 2.6: Implement `summarizeSignals()`

**Priority:** Must Have
**Estimated Complexity:** Simple
**SRS Reference:** Section 6.6

**TDD Steps:**

1. Write tests for:
   - Single keyword match
   - Multiple keywords
   - Extensions only
   - Patterns (count format)
   - Paths only
   - All signal types combined
   - Empty signals

2. Implement grouping and formatting

**Acceptance Criteria:**

- [ ] Format: `keywords[a, b], extensions[.pdf], patterns[2 matched], paths[invoices/]`
- [ ] Groups in consistent order: keywords, extensions, patterns, paths
- [ ] Patterns show count, not values

---

### Task 2.7: Implement `formatContext()`

**Priority:** Must Have
**Estimated Complexity:** Simple
**SRS Reference:** Section 6.6

**Dependencies:** `summarizeSignals()` must be complete

**TDD Steps:**

1. Write tests for:
   - Single skill match
   - Multiple skill matches
   - Skill with long name/path
   - Score formatting (1 decimal place)

2. Implement context formatting per SRS 6.6

**Acceptance Criteria:**

- [ ] Header line: `[Skill Router] The following skills are relevant...`
- [ ] Each skill on bullet line with path and score
- [ ] Matched signals as sub-item
- [ ] Footer instruction to read SKILL.md files
- [ ] Clean newline handling

---

## Phase 3: Data Loading & Validation

### Task 3.1: Implement Manifest Loading

**Priority:** Must Have
**Estimated Complexity:** Medium
**SRS Reference:** Section 5.1

**TDD Steps:**

1. Write tests for:
   - Valid manifest loads correctly
   - Missing file throws descriptive error
   - Invalid JSON throws descriptive error
   - Missing required fields detected
   - Default values applied for optional fields
   - Schema validation (version, config, skills array)

2. Implement `loadManifest()` function

**Acceptance Criteria:**

- [ ] Returns typed `SkillManifest` or throws descriptive error
- [ ] Validates version field exists
- [ ] Validates config.weights has all required keys
- [ ] Validates config.activationThreshold is number
- [ ] Validates skills is non-empty array (warning if empty)
- [ ] Each skill has path, name, triggers
- [ ] Performance: <5ms load time

---

### Task 3.2: Implement Hook Input Parsing

**Priority:** Must Have
**Estimated Complexity:** Simple
**SRS Reference:** Section 5.2

**TDD Steps:**

1. Write tests for:
   - Valid JSON input parsed correctly
   - Empty stdin handled gracefully
   - Invalid JSON handled gracefully
   - Missing `prompt` field handled
   - Prompt is whitespace-only handled

2. Implement `parseHookInput()` function

**Acceptance Criteria:**

- [ ] Reads from stdin (process.stdin)
- [ ] Returns typed `HookInput` with prompt, sessionId, timestamp
- [ ] Throws specific error for invalid input
- [ ] Handles encoding issues gracefully

---

## Phase 4: Output Generation

### Task 4.1: Implement Log Entry Builder

**Priority:** Must Have
**Estimated Complexity:** Medium
**SRS Reference:** Section 5.5, 9.3

**TDD Steps:**

1. Write tests for:
   - Complete log entry structure
   - Prompt truncation at 500 chars
   - Timestamp format (ISO 8601 with ms)
   - Execution time calculation
   - Outcome values (activated, no_match, error)

2. Implement `buildLogEntry()` function

**Acceptance Criteria:**

- [ ] All fields from SRS 5.5 present
- [ ] promptRaw truncated to 500 chars if longer
- [ ] timestamp is valid ISO 8601
- [ ] executionTimeMs is positive number
- [ ] outcome is one of: 'activated' | 'no_match' | 'error'

---

### Task 4.2: Implement Log Writer

**Priority:** Must Have
**Estimated Complexity:** Simple
**SRS Reference:** Section 9.1, 9.2

**TDD Steps:**

1. Write tests for:
   - Log file created if not exists
   - Log directory created if not exists
   - Entry appended as single JSON line
   - UTF-8 encoding
   - Atomic write (single append)
   - Write failure doesn't crash

2. Implement `writeLog()` function

**Acceptance Criteria:**

- [ ] Creates directory if needed (fs.mkdirSync recursive)
- [ ] Creates file if needed
- [ ] Appends newline-terminated JSON
- [ ] Handles write errors gracefully (stderr message)
- [ ] Performance: <2ms

---

### Task 4.3: Implement Hook Output Builder

**Priority:** Must Have
**Estimated Complexity:** Trivial
**SRS Reference:** Section 5.3

**TDD Steps:**

1. Write tests for:
   - Output structure matches schema
   - hookEventName is correct
   - additionalContext included

2. Implement `buildOutput()` function

**Acceptance Criteria:**

- [ ] Returns typed `HookOutput` matching schema
- [ ] `hookSpecificOutput.hookEventName` = "UserPromptSubmit"
- [ ] `hookSpecificOutput.additionalContext` = formatted context string

---

## Phase 5: Main Execution Flow

### Task 5.1: Implement Main Function

**Priority:** Must Have
**Estimated Complexity:** Medium
**SRS Reference:** Section 6.1

**Dependencies:** All Phase 2-4 tasks complete

**TDD Steps:**

1. Write integration tests for:
   - Full flow with matching skill
   - Full flow with no matches
   - Empty prompt handling
   - Manifest not found handling
   - Invalid manifest handling
   - Processing error handling

2. Implement `main()` function following SRS 6.1

**Acceptance Criteria:**

- [ ] Follows exact algorithm from SRS 6.1
- [ ] Always exits with code 0 (process.exit(0))
- [ ] Errors logged but don't block user
- [ ] Output only written when skills matched
- [ ] Execution time measured and logged

---

### Task 5.2: Implement Error Handling Wrapper

**Priority:** Must Have
**Estimated Complexity:** Simple
**SRS Reference:** Section 8

**TDD Steps:**

1. Write tests for:
   - Any exception results in exit 0
   - Errors logged to file
   - Errors written to stderr with prefix
   - Stack trace included in log

2. Implement try/catch wrapper

**Acceptance Criteria:**

- [ ] Never exits with non-zero code
- [ ] All errors logged with full context
- [ ] stderr messages prefixed with `[Skill Router Error]`
- [ ] Stack traces logged (not printed to stderr)

---

## Phase 6: Integration & Configuration

### Task 6.1: Create Sample Manifest

**Priority:** Must Have
**Estimated Complexity:** Simple

Create `.claude/skills-manifest.json` with sample configuration.

**Acceptance Criteria:**

- [ ] Valid JSON matching schema
- [ ] Reasonable default weights
- [ ] At least 2 sample skill entries pointing to existing skills
- [ ] Comments explaining each section (in separate README)

---

### Task 6.2: Register Hook in Settings

**Priority:** Must Have
**Estimated Complexity:** Simple
**SRS Reference:** Section 11.2

Update or create `.claude/settings.json` with hook registration.

**Acceptance Criteria:**

- [ ] UserPromptSubmit hook registered
- [ ] Command: `npx tsx "$CLAUDE_PROJECT_DIR/.claude/hooks/skill-router.ts"`
- [ ] Uses $CLAUDE_PROJECT_DIR for path
- [ ] Empty matcher (matches all prompts)

---

### Task 6.3: End-to-End Testing

**Priority:** Must Have
**Estimated Complexity:** Medium

Create integration tests that simulate full hook invocation.

**Acceptance Criteria:**

- [ ] Test simulates stdin JSON input
- [ ] Test captures stdout JSON output
- [ ] Test verifies log file entries
- [ ] Test covers: match, no-match, error scenarios
- [ ] Performance test: 1000 invocations under 50ms each

---

### Task 6.4: Create Manifest Generator Script

**Priority:** Should Have
**Estimated Complexity:** Medium

Create script to auto-generate manifest from existing skills.

**Acceptance Criteria:**

- [ ] Scans `.claude/skills/` for SKILL.md files
- [ ] Extracts name from YAML frontmatter
- [ ] Extracts keywords from description
- [ ] Generates manifest skeleton
- [ ] User can customize triggers after generation

---

## Phase 7: Documentation

### Task 7.1: Update CLAUDE.md

**Priority:** Should Have
**Estimated Complexity:** Trivial

Add skill router documentation to project context.

**Acceptance Criteria:**

- [ ] Brief description of skill router
- [ ] Command to view logs
- [ ] Command to validate manifest
- [ ] Stays under 100 lines total

---

### Task 7.2: Create Manifest Documentation

**Priority:** Should Have
**Estimated Complexity:** Simple

Create `.claude/hooks/README.md` explaining manifest configuration.

**Acceptance Criteria:**

- [ ] Schema documentation
- [ ] Weight tuning guidelines
- [ ] Threshold tuning guidelines
- [ ] Example configurations
- [ ] Troubleshooting section

---

## Task Dependency Graph

```
Phase 1 (Setup)
    ├── 1.1 Directory Structure
    ├── 1.2 TypeScript & Test Infrastructure
    └── 1.3 Type Definitions

Phase 2 (Core Functions) - Sequential due to dependencies
    ├── 2.1 normalizePrompt()
    ├── 2.2 extractSignals()
    ├── 2.3 scoreSkill()        ← depends on 2.2
    ├── 2.4 filterByThreshold()
    ├── 2.5 sortDescendingByScore()
    ├── 2.6 summarizeSignals()
    └── 2.7 formatContext()     ← depends on 2.6

Phase 3 (Data Loading) - Can parallelize
    ├── 3.1 Manifest Loading
    └── 3.2 Hook Input Parsing

Phase 4 (Output Generation) - Can parallelize
    ├── 4.1 Log Entry Builder
    ├── 4.2 Log Writer
    └── 4.3 Hook Output Builder

Phase 5 (Main Flow) - Sequential
    ├── 5.1 Main Function        ← depends on all Phase 2-4
    └── 5.2 Error Handling       ← depends on 5.1

Phase 6 (Integration)
    ├── 6.1 Sample Manifest
    ├── 6.2 Hook Registration    ← depends on 5.2
    ├── 6.3 E2E Testing          ← depends on 6.2
    └── 6.4 Manifest Generator

Phase 7 (Documentation) - Parallel, after Phase 6
    ├── 7.1 Update CLAUDE.md
    └── 7.2 Manifest Docs
```

---

## Progress Tracking

| Task | Status | Tests | Implementation | Notes |
|------|--------|-------|----------------|-------|
| 1.1  | [x]    | N/A   | [x]            | pnpm workspace structure |
| 1.2  | [x]    | N/A   | [x]            | TypeScript + Vitest configured |
| 1.3  | [x]    | N/A   | [x]            | All interfaces in types.ts |
| 2.1  | [x]    | [x]   | [x]            | normalize.ts |
| 2.2  | [x]    | [x]   | [x]            | signals.ts |
| 2.3  | [x]    | [x]   | [x]            | scoring.ts |
| 2.4  | [x]    | [x]   | [x]            | filtering.ts |
| 2.5  | [x]    | [x]   | [x]            | filtering.ts |
| 2.6  | [x]    | [x]   | [x]            | formatting.ts |
| 2.7  | [x]    | [x]   | [x]            | formatting.ts |
| 3.1  | [x]    | [x]   | [x]            | manifest.ts |
| 3.2  | [x]    | [x]   | [x]            | input.ts |
| 4.1  | [x]    | [x]   | [x]            | logging.ts |
| 4.2  | [x]    | [x]   | [x]            | logging.ts |
| 4.3  | [x]    | [x]   | [x]            | output.ts |
| 5.1  | [x]    | [x]   | [x]            | main.ts - processPrompt() |
| 5.2  | [x]    | [x]   | [x]            | main.ts - main() with error handling |
| 6.1  | [x]    | N/A   | [x]            | .claude/skills-manifest.json |
| 6.2  | [x]    | N/A   | [x]            | .claude/settings.json |
| 6.3  | [x]    | [x]   | [x]            | integration.test.ts |
| 6.4  | [ ]    | [ ]   | [ ]            | Optional: manifest generator |
| 7.1  | [x]    | N/A   | [x]            | CLAUDE.md updated |
| 7.2  | [x]    | N/A   | [x]            | .claude/hooks/README.md |

**Summary:** 106 tests passing. All required tasks complete. Optional: Task 6.4 (manifest generator).

---

## TDD Workflow Reminder

For each task:

1. **RED:** Write failing test(s) that define expected behavior
2. **GREEN:** Write minimal code to make tests pass
3. **REFACTOR:** Clean up while keeping tests green

**Commands:**

```bash
# Install dependencies
pnpm install

# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run with coverage
pnpm test:coverage

# Run specific test file
pnpm vitest run tests/skill-router/normalize.test.ts

# Execute router directly
pnpm router
```
