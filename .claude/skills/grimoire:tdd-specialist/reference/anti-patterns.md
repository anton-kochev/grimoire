# Testing Anti-Patterns

Common testing mistakes that reduce test value and increase maintenance cost. These are language-agnostic — they apply to any test framework.

## Table of Contents

- [The Liar](#the-liar)
- [The Giant](#the-giant)
- [Excessive Setup](#excessive-setup)
- [The Slow Poke](#the-slow-poke)
- [The Peeping Tom](#the-peeping-tom)
- [The Mockery](#the-mockery)
- [The Inspector](#the-inspector)
- [The Flaky Test](#the-flaky-test)

## The Liar

**What it is:** A test that passes but doesn't actually verify the behavior it claims to test. It gives false confidence.

**How to spot it:**
- Test name says "validates input" but assertions only check the return type
- Assertions are too loose (`assert result is not None` instead of checking the actual value)
- Test catches exceptions broadly and passes regardless

**Fix:** Ensure assertions directly verify the specific behavior described in the test name. Every assertion should fail if the behavior breaks.

```python
# Bad — passes even if discount logic is completely wrong
def test_apply_discount():
    result = apply_discount(100, 10)
    assert result is not None

# Good — fails if the calculation is wrong
def test_apply_discount_with_10_percent_returns_90():
    result = apply_discount(100, 10)
    assert result == 90.0
```

## The Giant

**What it is:** A single test that verifies too many things. When it fails, you can't tell which behavior broke.

**How to spot it:**
- Test has more than 8-10 assertions
- Test name uses "and" (e.g., "creates user and sends email and updates cache")
- Multiple Act phases in one test

**Fix:** Split into focused tests, each verifying one logical concept. Multiple assertions are fine if they verify aspects of the same behavior.

```typescript
// Bad — three unrelated behaviors in one test
test('user registration works', () => {
  const user = register({ name: 'Alice', email: 'alice@test.com' });
  expect(user.id).toBeDefined();
  expect(emailService.send).toHaveBeenCalled();
  expect(cache.set).toHaveBeenCalledWith(`user:${user.id}`, user);
  expect(auditLog.entries).toHaveLength(1);
});

// Good — separate tests for each behavior
test('register with valid data creates user with id', () => { ... });
test('register with valid data sends welcome email', () => { ... });
test('register with valid data caches the user', () => { ... });
test('register with valid data writes audit log entry', () => { ... });
```

## Excessive Setup

**What it is:** Tests that require dozens of lines of setup before the actual test logic. Often signals that the code under test has too many dependencies.

**How to spot it:**
- Arrange section is 20+ lines
- Multiple mocks configured with complex behaviors
- Shared setup methods that configure things most tests don't need

**Fix:** Use factory methods/builders for test data. Consider whether the code under test needs refactoring to reduce dependencies. Only set up what the specific test needs.

```go
// Bad — every test sets up the entire world
func TestProcessOrder(t *testing.T) {
    db := setupDatabase()
    cache := setupCache()
    logger := setupLogger()
    emailClient := setupEmailClient()
    validator := NewValidator(db)
    processor := NewProcessor(cache)
    service := NewOrderService(db, cache, logger, emailClient, validator, processor)
    // ... 10 more lines of setup
    result, err := service.ProcessOrder(ctx, order)
    assert.NoError(t, err)
}

// Good — factory method hides irrelevant details
func TestProcessOrder_WithValidOrder_Succeeds(t *testing.T) {
    service := newTestOrderService(t)
    result, err := service.ProcessOrder(ctx, validOrder())
    assert.NoError(t, err)
    assert.Equal(t, "processed", result.Status)
}
```

## The Slow Poke

**What it is:** Tests that are slow because they use real I/O, network calls, or sleeps. Slow tests get run less frequently and slow down the feedback loop.

**How to spot it:**
- `time.Sleep()`, `Thread.sleep()`, `setTimeout` in tests
- Real HTTP calls, database connections, file system operations
- Test suite takes more than a few seconds for unit tests

**Fix:** Mock external dependencies. Use fake implementations for I/O. Replace time-based waits with event-based synchronization.

## The Peeping Tom

**What it is:** Tests that access private/internal state to verify behavior instead of testing through the public interface.

**How to spot it:**
- Reflection to access private fields
- Testing internal method calls instead of observable results
- Assertions on implementation details (internal data structures, private counters)

**Fix:** Test through the public API. If you can't verify behavior through the public interface, the class may need a design change (e.g., expose a query method or extract a collaborator).

## The Mockery

**What it is:** Tests that mock so heavily that they're testing mock configurations rather than real behavior. Every dependency is mocked, including simple value objects.

**How to spot it:**
- More mock setup lines than actual test logic
- Mocking concrete classes, value objects, or data structures
- Test passes but the real system fails because mocks don't match reality

**Fix:** Only mock at system boundaries (external services, databases, clocks). Use real implementations for in-process collaborators when practical.

## The Inspector

**What it is:** Tests that verify exact method calls and their order rather than outcomes. They break whenever the implementation changes, even if behavior is preserved.

**How to spot it:**
- `verify(mock, times(1)).method()` for every mock interaction
- Assertions on call order
- Test breaks when you refactor without changing behavior

**Fix:** Verify state (the result) rather than interactions (how it got there). Only verify interactions for side effects that ARE the behavior (e.g., "email was sent").

```java
// Bad — breaks if implementation changes sort algorithm
verify(sorter, times(1)).quickSort(any());
verify(sorter, never()).mergeSort(any());

// Good — verifies the outcome
assertThat(result).isSortedAccordingTo(naturalOrder());
```

## The Flaky Test

**What it is:** Tests that pass and fail intermittently without code changes. They erode trust in the test suite.

**Common causes:**
- Time-dependent logic (`new Date()`, `time.Now()`)
- Random data without fixed seeds
- Shared mutable state between tests
- Race conditions in async tests
- Dependency on test execution order

**Fix:** Inject time as a dependency. Use fixed seeds for randomness. Ensure test isolation. Use proper async synchronization.
