# TDD Workflow Patterns

Guidance on the test-driven development process, when to apply it, and advanced techniques.

## Table of Contents

- [Red-Green-Refactor](#red-green-refactor)
- [Transformation Priority Premise](#transformation-priority-premise)
- [When to Use TDD](#when-to-use-tdd)
- [When TDD Is Less Effective](#when-tdd-is-less-effective)
- [BDD and ATDD Extensions](#bdd-and-atdd-extensions)

## Red-Green-Refactor

The core TDD cycle, repeated in small increments:

### 1. Red — Write a Failing Test

Write the smallest test that describes the next piece of behavior. The test MUST fail before you write any production code. A test that passes immediately provides no confidence.

**Rules:**
- Write only ONE test at a time
- The test should compile/parse but fail at the assertion
- If the test passes immediately, it's either trivial or testing existing behavior

### 2. Green — Make It Pass

Write the MINIMUM code to make the failing test pass. Do not add extra logic, handle cases not yet tested, or optimize.

**Rules:**
- Write the simplest code that makes the test pass
- It's OK to hardcode values initially — the next test will force generalization
- Do not add code for future tests
- All existing tests must still pass

### 3. Refactor — Clean Up

With all tests green, improve the code structure without changing behavior. Tests give you the safety net.

**Rules:**
- No new functionality during refactoring
- All tests must remain green after each refactoring step
- Remove duplication, improve naming, extract methods
- Refactor both production code AND test code

### Cycle Length

Each Red-Green-Refactor cycle should take 1-10 minutes. If you're spending more than 10 minutes in the Red or Green phase, the step is too large — break it down.

## Transformation Priority Premise

Kent Beck's insight: when going from Red to Green, prefer simpler transformations over complex ones. Listed from simplest to most complex:

1. **Constant** — return a hardcoded value
2. **Scalar** — replace constant with a variable
3. **Direct** — replace unconditional with conditional (if/else)
4. **Collection** — operate on a collection instead of a scalar
5. **Iteration** — add a loop
6. **Recursion** — add recursive call
7. **Assignment** — replace computed value with mutation

**Example — building FizzBuzz with TDD:**

```
Test 1: input 1 → "1"          Transformation: Constant
Test 2: input 2 → "2"          Transformation: Scalar (use the input)
Test 3: input 3 → "Fizz"       Transformation: Direct (add if)
Test 4: input 5 → "Buzz"       Transformation: Direct (add another if)
Test 5: input 15 → "FizzBuzz"  Transformation: Direct (add combined if)
Test 6: input 1-15 → full list Transformation: Iteration (generalize)
```

By following this priority, you avoid over-engineering early and let the design emerge naturally from the tests.

## When to Use TDD

TDD is most valuable when:

- **Business logic** — Complex rules, calculations, state machines. TDD forces you to think through all cases before implementing.
- **Algorithm development** — Sorting, parsing, validation, transformation logic. Tests serve as a specification.
- **Bug fixes** — Write a test that reproduces the bug first (Red), then fix it (Green). This prevents regressions.
- **API/interface design** — Writing tests first helps you design interfaces from the consumer's perspective.
- **Refactoring** — Ensure tests exist before refactoring. If they don't, write characterization tests first, then refactor.

## When TDD Is Less Effective

TDD is not universally optimal. Use judgment:

- **UI/visual components** — Layout, styling, animations are hard to express as unit tests. Use visual regression testing or snapshot tests instead.
- **Exploratory/prototype code** — When you don't know what to build yet, writing tests first slows exploration. Spike first, then write tests.
- **Thin integration layers** — Simple pass-through code (e.g., a controller that calls a service) may not benefit from test-first approach. Integration tests are more valuable here.
- **Infrastructure/glue code** — Database migrations, config files, build scripts. Test these with integration or end-to-end tests.
- **External API wrappers** — Thin clients wrapping external APIs are better tested with integration tests against the real (or sandboxed) API.

For these cases, write tests AFTER the implementation (test-last), but still write them.

## BDD and ATDD Extensions

### Behavior-Driven Development (BDD)

BDD extends TDD by using natural language to describe behavior. Useful when tests need to be readable by non-developers.

**Given-When-Then** structure:

```gherkin
Given a cart with items totaling $100
When a 10% discount is applied
Then the total should be $90
```

Maps to test code:

```python
def test_cart_with_10_percent_discount_totals_90():
    # Given
    cart = Cart(items=[Item(price=100)])

    # When
    cart.apply_discount(PercentageDiscount(10))

    # Then
    assert cart.total == 90.0
```

### Acceptance TDD (ATDD)

Write high-level acceptance tests before implementing a feature. These tests describe the feature from the user's perspective and drive the overall design. Unit tests (via TDD) then drive the implementation of each component.

**Flow:**
1. Write acceptance test (fails — Red)
2. Use TDD to implement components needed to pass it
3. Acceptance test passes (Green)
4. Refactor

ATDD is most valuable for features with clear acceptance criteria and when working with product owners or stakeholders.
