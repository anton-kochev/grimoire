# TDD Workflow Patterns

Guidance on the test-driven development process, when to apply it, and advanced techniques.

## Table of Contents

- [Canon TDD — Start with a Test List](#canon-tdd--start-with-a-test-list)
- [Red-Green-Refactor](#red-green-refactor)
- [Transformation Priority Premise](#transformation-priority-premise)
- [F.I.R.S.T. Principles](#first-principles)
- [London School vs Detroit School](#london-school-vs-detroit-school)
- [When to Use TDD](#when-to-use-tdd)
- [When TDD Is Less Effective](#when-tdd-is-less-effective)
- [BDD and ATDD Extensions](#bdd-and-atdd-extensions)
- [Advanced Techniques](#advanced-techniques)

## Canon TDD — Start with a Test List

> Source: https://tidyfirst.substack.com/p/canon-tdd

Kent Beck's recommended starting point is not a single test but a **test list** — a written enumeration of all behaviors you intend to verify. This separates the creative work (what to test) from the mechanical work (write, make pass, refactor).

**Process:**
1. Write down all behaviors the code needs — a flat list, not tests
2. Pick the simplest item on the list
3. Write one failing test for it
4. Make it pass with the minimum code
5. Refactor
6. Cross off the item; repeat

**Why test order matters:** Starting with simpler behaviors forces simpler transformations (see TPP below) and lets the design emerge naturally. Jumping to complex cases early leads to over-engineered solutions. The test list keeps you focused and prevents scope creep.

## Red-Green-Refactor

> Source: https://martinfowler.com/bliki/TestDrivenDevelopment.html

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

Each Red-Green-Refactor cycle should take 1–10 minutes. If you're spending more than 10 minutes in the Red or Green phase, the step is too large — break it down.

## Transformation Priority Premise

> Source: http://blog.cleancoder.com/uncle-bob/2013/05/27/TheTransformationPriorityPremise.html

When going from Red to Green, prefer simpler transformations over complex ones. Listed from simplest to most complex:

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

## F.I.R.S.T. Principles

Every unit test must satisfy these five properties:

| Principle | Definition | Violation Signal |
|-----------|------------|-----------------|
| **Fast** | Runs in milliseconds | Real I/O, network calls, `sleep()` |
| **Independent** | No dependency on other tests | Shared mutable state, ordered execution |
| **Repeatable** | Same result every run | System clock, random data without seed, race conditions |
| **Self-Validating** | Pass or fail without manual interpretation | Tests that print output for a human to read |
| **Timely** | Written before or alongside production code | Tests added weeks after a feature shipped |

F.I.R.S.T. is a diagnostic checklist: if a test violates any property, it will erode team trust and reduce the value of the suite.

## London School vs Detroit School

> Source: https://martinfowler.com/articles/mocksArentStubs.html

Two schools of TDD with different philosophies on test doubles. Most teams use a hybrid.

### Detroit School (Classicist, Inside-Out)

- **Unit definition**: A module of any size — can span multiple classes
- **Approach**: Bottom-up; start from domain logic, build outward
- **Test doubles**: Avoid mocks; use real objects when feasible
- **Verification**: State verification — examine the result after execution
- **Testing style**: Black-box; test through public API
- **Refactoring**: Safe — tests aren't coupled to implementation details
- **Best for**: Building confidence in real interactions; reducing brittleness

### London School (Mockist, Outside-In)

- **Unit definition**: A single class in isolation
- **Approach**: Top-down; start from the API, work inward
- **Test doubles**: Mock all collaborators
- **Verification**: Behavior verification — confirm correct method calls occurred
- **Testing style**: White-box; tests know about internals
- **Refactoring**: Can be brittle — tests break when implementation changes
- **Best for**: Designing interactions upfront; driving architecture decisions

### Recommended: Hybrid Approach

Apply Detroit discipline as the default — use real objects, verify state. Apply London mocking only at architectural boundaries (external APIs, databases, clocks). Never mock value objects, pure functions, or in-process helpers.

The most important rule: if you're mocking to make a test easy to write, that's often a design smell (see The Hard Test in anti-patterns). If you're mocking because the dependency is genuinely external or slow, that's the right use.

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

> Source: https://martinfowler.com/bliki/GivenWhenThen.html

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

## Advanced Techniques

### Property-Based Testing

Instead of writing individual input/output pairs, define **properties** that should always hold true and let a framework generate hundreds of test cases automatically.

**Best for:** Pure functions, algorithms, data transformations, serialization round-trips.

**Tools:**
- Python: [Hypothesis](https://hypothesis.readthedocs.io)
- JavaScript/TypeScript: [fast-check](https://fast-check.dev)
- Go: `testing/quick` (stdlib), [gopter](https://github.com/leanovate/gopter)
- Rust: [proptest](https://github.com/proptest-rs/proptest)
- Java: [jqwik](https://jqwik.net)
- Elixir: [StreamData](https://hexdocs.pm/stream_data)

**Example property** (Python/Hypothesis):
```python
from hypothesis import given, strategies as st

@given(st.lists(st.integers()))
def test_sort_is_idempotent(lst):
    assert sorted(sorted(lst)) == sorted(lst)
```

### Mutation Testing

Mutation testing introduces small code changes (mutations) and checks whether your tests catch them. A test suite that lets mutations survive has gaps in its coverage.

**Metric:** Mutation score = % of mutations killed. Target 80%+.

**Tools:**
- JavaScript/TypeScript/C#: [Stryker](https://stryker-mutator.io)
- Java: [PITest](https://pitest.org)
- Python: [mutmut](https://mutmut.readthedocs.io)
- Go: [go-mutesting](https://github.com/zimmski/go-mutesting)

Run mutation testing periodically (not on every commit) to identify weak spots in the test suite.

### Contract Testing

In microservice or distributed architectures, contract tests verify that services communicate correctly without running full integration tests.

**How it works:**
1. Consumer defines a contract (expected interactions)
2. Provider verifies it can fulfill the contract
3. Both test independently — no need to spin up the full system

**Tool:** [Pact](https://pact.io) — supports most major languages.

Contract tests replace the expensive integration test layer for inter-service communication while still catching breaking API changes early.
