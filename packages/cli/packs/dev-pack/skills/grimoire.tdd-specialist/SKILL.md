---
name: grimoire.tdd-specialist
description: "Language-agnostic TDD and unit testing specialist. Use when writing unit tests, adding test coverage, doing test-driven development, or setting up test infrastructure in ANY language. Auto-detects project language and test framework. Supports pytest, jest, vitest, mocha, junit, go test, cargo test, xunit, and more. Triggers: tdd, test-driven, unit test, write tests, test coverage, red-green-refactor."
version: 1.0.0
---

# TDD Specialist

Language-agnostic test-driven development and unit testing guidance. Works with any language — detects the project's test stack automatically and applies universal TDD principles.

## Context

Test-driven development produces cleaner designs, fewer bugs, and enables confident refactoring. AI-assisted TDD works best with a structured workflow: humans define goals and approve test plans, AI executes the implementation. This skill provides the knowledge base for that workflow.

## Language & Framework Detection

### Step 1: Detect Language

Check for project manifest files to determine the primary language:

| File | Language |
|------|----------|
| `package.json` | JavaScript / TypeScript |
| `tsconfig.json` | TypeScript |
| `pyproject.toml`, `setup.py`, `setup.cfg` | Python |
| `go.mod` | Go |
| `Cargo.toml` | Rust |
| `*.csproj`, `*.sln` | C# / .NET |
| `pom.xml`, `build.gradle`, `build.gradle.kts` | Java / Kotlin |
| `Gemfile` | Ruby |
| `mix.exs` | Elixir |
| `Package.swift` | Swift |

### Step 2: Detect Test Framework

**Always check existing test files first** — match whatever the project already uses.

If no existing tests, infer from config:

- **JavaScript/TypeScript**: Check `package.json` devDependencies for `vitest`, `jest`, `mocha`. Default: Vitest for Vite projects, Jest otherwise.
- **Python**: Check for `pytest` in dependencies or `[tool.pytest]` in `pyproject.toml`. Default: pytest.
- **Go**: Built-in `testing` package. Check for `testify` in `go.mod`.
- **Rust**: Built-in `#[test]`. Check for `mockall` in `Cargo.toml`.
- **C#/.NET**: Check `.csproj` for xUnit/NUnit/MSTest references. **If `grimoire.dotnet-unit-testing` skill is available, defer to it.**
- **Java/Kotlin**: Check for JUnit 5 (`junit-jupiter`), Mockito in build files. Default: JUnit 5 + Mockito.
- **Ruby**: Check for `rspec` or `minitest` in Gemfile. Default: RSpec.

### Step 3: Detect Conventions

Read 2-3 existing test files to learn:
- File naming convention (e.g., `test_*.py`, `*.test.ts`, `*_test.go`)
- Directory structure (e.g., `tests/`, `__tests__/`, co-located)
- Assertion style and helper patterns
- Mocking approach

## Workflow

### Step 1: Analyze

- Read the source code under test
- Detect language and test framework (steps above)
- Identify dependencies that need mocking/stubbing
- Check for existing test patterns in the project
- Understand the expected behavior and edge cases

### Step 2: Plan (REQUIRES USER APPROVAL)

Present test cases as **method/function names only**, grouped by category. Do NOT include test bodies.

**Format:**

```plain
## Test Plan for [Module/Class.Method]

**Language:** [detected] | **Framework:** [detected] | **File:** [proposed test file path]

### Success Scenarios
- test_process_order_with_valid_input_returns_success
- test_process_order_with_discount_applies_correctly

### Validation Failures
- test_process_order_with_null_input_raises_value_error
- test_process_order_with_empty_items_raises_validation_error

### Error Handling
- test_process_order_when_repository_fails_raises_service_error

### Edge Cases
- test_process_order_with_maximum_items_succeeds

Do you approve this test plan? I will proceed only after your confirmation.
```

**STOP and WAIT for user approval before proceeding.**

### Step 3: Write (ONLY after approval)

Implement tests following:
- Detected framework conventions
- AAA (Arrange-Act-Assert) or Given-When-Then pattern
- Language-idiomatic naming and style
- Proper mocking/stubbing at boundaries

### Step 4: Explain

- Present the complete test file
- Explain what each test validates
- Highlight assumptions made
- Suggest additional scenarios if relevant

## Universal Testing Principles

### Arrange-Act-Assert (AAA)

Structure every test with clearly separated phases. Use comments for clarity:

```python
# Python / pytest
def test_calculate_total_with_discount_applies_percentage():
    # Arrange
    cart = Cart(items=[Item(price=100), Item(price=50)])
    discount = PercentageDiscount(10)

    # Act
    total = cart.calculate_total(discount)

    # Assert
    assert total == 135.0
```

```typescript
// TypeScript / Vitest
test('calculateTotal with discount applies percentage', () => {
  // Arrange
  const cart = new Cart([{ price: 100 }, { price: 50 }]);
  const discount = new PercentageDiscount(10);

  // Act
  const total = cart.calculateTotal(discount);

  // Assert
  expect(total).toBe(135.0);
});
```

```go
// Go / testing
func TestCalculateTotal_WithDiscount_AppliesPercentage(t *testing.T) {
    // Arrange
    cart := NewCart([]Item{{Price: 100}, {Price: 50}})
    discount := NewPercentageDiscount(10)

    // Act
    total := cart.CalculateTotal(discount)

    // Assert
    assert.Equal(t, 135.0, total)
}
```

### Test Naming

Use the language-idiomatic convention:

| Language | Convention | Example |
|----------|-----------|---------|
| Python | `test_method_scenario_expected` | `test_get_user_with_invalid_id_raises_not_found` |
| JS/TS | descriptive string | `'getUser with invalid id throws NotFound'` |
| Go | `TestMethod_Scenario_Expected` | `TestGetUser_WithInvalidId_ReturnsNotFound` |
| Rust | `test_method_scenario_expected` | `test_get_user_with_invalid_id_returns_not_found` |
| Java/C# | `MethodName_Scenario_ExpectedBehavior` | `GetUser_WithInvalidId_ThrowsNotFoundException` |
| Ruby | descriptive string (RSpec) | `'raises NotFound for invalid id'` |

### Test Isolation

- Each test must be independent — no shared mutable state
- Use setup/teardown (beforeEach, setUp, constructor) for fresh fixtures
- Tests must pass in any order and in parallel
- Never depend on external services, file system, or network in unit tests

### Mocking Boundaries

- Mock/stub at system boundaries only (databases, APIs, file system, clock)
- Do NOT mock the class under test
- Do NOT mock value objects or simple data structures
- Prefer fakes/stubs over mocks when possible — verify state, not interactions
- Use dependency injection to make code testable

### One Assertion Focus

Each test should verify ONE logical concept. Multiple `assert` calls are fine if they verify aspects of the same behavior:

```python
# Good — one concept (successful creation), multiple assertions
def test_create_user_with_valid_data_returns_user():
    user = create_user(name="Alice", email="alice@example.com")
    assert user.name == "Alice"
    assert user.email == "alice@example.com"
    assert user.id is not None

# Bad — testing two unrelated behaviors in one test
def test_user_creation_and_deletion():
    user = create_user(name="Alice")
    assert user.id is not None
    delete_user(user.id)
    assert get_user(user.id) is None  # This is a separate test
```

### Test Behavior, Not Implementation

Tests should verify WHAT the code does, not HOW it does it:

```typescript
// Good — tests the result
expect(sort([3, 1, 2])).toEqual([1, 2, 3]);

// Bad — tests that a specific algorithm was used
expect(quickSort).toHaveBeenCalledWith([3, 1, 2]);
```

## Constraints

### ALWAYS

- ALWAYS detect language and framework before writing tests
- ALWAYS check for existing test files and match their conventions
- ALWAYS present test plan as method names ONLY before writing
- ALWAYS ask for explicit approval: "Do you approve this test plan?"
- ALWAYS use AAA pattern with section comments
- ALWAYS use language-idiomatic naming conventions
- ALWAYS isolate tests — no shared mutable state between tests

### NEVER

- NEVER write test implementations until user explicitly approves the plan
- NEVER create production code — only test code
- NEVER mock the class/module under test
- NEVER write tests that depend on execution order
- NEVER use real external services (databases, APIs) in unit tests
- NEVER ignore existing project test conventions

## Reference Materials

For detailed guidance on specific topics:

- **[Language Frameworks](reference/language-frameworks.md)** — Framework-specific patterns, assertions, and setup for each language
- **[Anti-Patterns](reference/anti-patterns.md)** — Common testing mistakes and how to fix them
- **[TDD Workflow Patterns](reference/tdd-workflow-patterns.md)** — Red-Green-Refactor, Transformation Priority Premise, when to use TDD
