---
name: grimoire.unit-testing-typescript
description: "TypeScript/JavaScript unit testing specialist. Framework selection, patterns, and best practices for Vitest, Jest, Mocha, and Node test runner. Use when writing tests for .ts/.tsx/.js files, configuring test frameworks, or asking about TypeScript testing patterns, mocking, assertions, async testing."
---

# TypeScript Unit Testing

Focused guidance for writing clean, type-safe unit tests in TypeScript and JavaScript projects.

## Framework Selection

### Detection

1. Check existing test files first — always match what the project uses
2. Check `package.json` devDependencies for `vitest`, `jest`, `mocha`, `@types/mocha`
3. Check for config files: `vitest.config.ts`, `jest.config.ts`, `.mocharc.*`

### Decision Table

| Condition | Use | Reason |
|-----------|-----|--------|
| Project has existing tests | **Match existing** | Consistency is paramount |
| Vite-based project | **Vitest** | Native integration, fastest |
| New TypeScript project | **Vitest** | ESM-native, Jest-compatible API, fast |
| React (CRA) or existing Jest | **Jest** | Mature ecosystem, wide adoption |
| Legacy project, custom setup | **Mocha + Chai** | Flexible, pluggable |
| Node.js 20+, minimal deps | **Node test runner** | Built-in, zero dependencies |
| User explicitly requests | **Requested** | Respect user preference |

## Naming Conventions

Use descriptive strings in `test()` or `it()`:

```typescript
// Pattern: 'methodName scenario expected behavior'
test('getUser with invalid id throws NotFound', () => { ... });
test('calculateTotal with discount applies percentage', () => { ... });
test('parseConfig with missing required fields throws ValidationError', () => { ... });

// describe blocks for grouping
describe('OrderService', () => {
  describe('processOrder', () => {
    test('with valid order saves and returns id', async () => { ... });
    test('with invalid order throws ValidationError', async () => { ... });
  });
});
```

## Patterns

### AAA with Vitest/Jest

```typescript
import { describe, test, expect, vi, beforeEach } from 'vitest';

describe('OrderService', () => {
  let mockRepo: MockedObject<OrderRepository>;
  let service: OrderService;

  beforeEach(() => {
    mockRepo = { save: vi.fn(), findById: vi.fn() };
    service = new OrderService(mockRepo);
  });

  test('processOrder with valid order saves and returns id', async () => {
    // Arrange
    const order = createValidOrder();
    mockRepo.save.mockResolvedValue({ id: '123' });

    // Act
    const result = await service.processOrder(order);

    // Assert
    expect(result.id).toBe('123');
    expect(mockRepo.save).toHaveBeenCalledWith(order);
  });

  test('processOrder with invalid order throws ValidationError', async () => {
    // Arrange
    const order = createInvalidOrder();

    // Act & Assert
    await expect(service.processOrder(order)).rejects.toThrow(ValidationError);
  });
});
```

### Parameterized Tests

```typescript
// Vitest/Jest
test.each([
  { discount: 0, expected: 100.0 },
  { discount: 10, expected: 90.0 },
  { discount: 50, expected: 50.0 },
])('applyDiscount with $discount% returns $expected', ({ discount, expected }) => {
  expect(applyDiscount(100, discount)).toBe(expected);
});

// With descriptive names via tagged template
test.each`
  input    | expected
  ${''}    | ${false}
  ${'abc'} | ${true}
  ${'a'}   | ${true}
`('isNonEmpty("$input") returns $expected', ({ input, expected }) => {
  expect(isNonEmpty(input)).toBe(expected);
});
```

### Async Testing

```typescript
// Async/await (preferred)
test('fetchUser resolves with user data', async () => {
  const user = await fetchUser('123');
  expect(user.name).toBe('Alice');
});

// Promise rejection
test('fetchUser with bad id rejects with NotFound', async () => {
  await expect(fetchUser('bad')).rejects.toThrow(NotFoundError);
});

// Callback-based (rare, legacy)
test('legacyFetch calls back with data', (done) => {
  legacyFetch('123', (err, data) => {
    expect(err).toBeNull();
    expect(data.name).toBe('Alice');
    done();
  });
});
```

### Error Testing

```typescript
// Sync errors
test('divide by zero throws', () => {
  expect(() => divide(1, 0)).toThrow('Cannot divide by zero');
});

// Async errors
test('save invalid order rejects with ValidationError', async () => {
  await expect(service.save(invalidOrder)).rejects.toThrow(ValidationError);
});

// Error properties
test('validation error includes field name', async () => {
  try {
    await service.save(invalidOrder);
    expect.fail('should have thrown');
  } catch (err) {
    expect(err).toBeInstanceOf(ValidationError);
    expect((err as ValidationError).field).toBe('items');
  }
});
```

## Mocking

### Vitest (`vi`)

```typescript
// Function mock
const mockFn = vi.fn().mockReturnValue(42);

// Module mock
vi.mock('./emailService', () => ({
  sendEmail: vi.fn().mockResolvedValue(true),
}));

// Spy on object method
const spy = vi.spyOn(console, 'log');

// Timer mocking
vi.useFakeTimers();
vi.advanceTimersByTime(1000);
vi.useRealTimers();

// Mock reset
beforeEach(() => vi.clearAllMocks());
```

### Jest (`jest`)

```typescript
// Same API, replace `vi` with `jest`
const mockFn = jest.fn().mockReturnValue(42);
jest.mock('./emailService');
jest.spyOn(console, 'log');
jest.useFakeTimers();
```

### Type-safe mocking

```typescript
// Use MockedObject for full type safety
import type { MockedObject } from 'vitest';

let mockRepo: MockedObject<OrderRepository>;

// Or create typed mock factories
function createMockRepo(overrides?: Partial<OrderRepository>): MockedObject<OrderRepository> {
  return {
    save: vi.fn(),
    findById: vi.fn(),
    delete: vi.fn(),
    ...overrides,
  } as MockedObject<OrderRepository>;
}
```

### What NOT to mock

- Value objects, DTOs, plain data structures
- Pure functions with no side effects
- The class/module under test itself
- Simple utility functions

Mock only at system boundaries: APIs, databases, file system, timers, randomness.

## File Conventions

- `*.test.ts` / `*.spec.ts` (co-located or in `__tests__/`)
- `vitest.config.ts` or `jest.config.ts` for configuration
- `vitest` or `jest` in `package.json` scripts
- Shared test utilities in `test/helpers/` or `__tests__/helpers/`

## Package Setup

```bash
# Vitest
npm install -D vitest @vitest/coverage-v8

# Jest with TypeScript
npm install -D jest ts-jest @types/jest
npx ts-jest config:init

# Optional: testing-library for DOM
npm install -D @testing-library/react @testing-library/jest-dom
```

## Authoritative Sources

- Vitest: https://vitest.dev
- Jest: https://jestjs.io
- Mocha: https://mochajs.org
- Kent Beck — Canon TDD: https://tidyfirst.substack.com/p/canon-tdd
- Martin Fowler — Mocks Aren't Stubs: https://martinfowler.com/articles/mocksArentStubs.html

## Reference Materials

- **[Anti-Patterns](reference/anti-patterns.md)** — Common testing mistakes and how to fix them
- **[TDD Workflow Patterns](reference/tdd-workflow-patterns.md)** — Red-Green-Refactor, Transformation Priority Premise, when to use TDD
