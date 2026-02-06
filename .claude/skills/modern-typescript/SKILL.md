---
name: modern-typescript
description: "Modern TypeScript best practices, patterns, and type system mastery for TS 5.7+. Use when writing TypeScript, reviewing TS code, designing types, configuring tsconfig, or asking about TypeScript patterns, generics, type safety, strict mode, idiomatic TypeScript, discriminated unions, branded types, or modern TS features."
---

# Modern TypeScript

Guidance for writing modern, idiomatic TypeScript (5.7+) following community best practices and the latest language features. Runtime-agnostic.

## Core Principles

### 1. Maximum Type Safety

- Enable `strict: true` — always, no exceptions
- Prefer `unknown` over `any` — force explicit narrowing
- Use `satisfies` over type assertions — preserves inference
- Annotate return types for public APIs — prevents accidental changes
- Let TypeScript infer where it can — avoid redundant annotations on locals

### 2. Leverage the Type System

- Model your domain with discriminated unions, not class hierarchies
- Use branded types for nominal typing (IDs, currencies, units)
- Prefer `readonly` by default — mutate only when necessary
- Use `as const` for literal types and exhaustive checks
- Template literal types for string-based APIs

### 3. Modern Language Features

- `using` / `await using` for resource management (TS 5.2+)
- `const` type parameters for literal inference (TS 5.0+)
- `satisfies` operator for constraint checking with inference (TS 5.0+)
- `NoInfer<T>` to control inference sites (TS 5.4+)
- Inferred type predicates for cleaner narrowing (TS 5.5+)

### 4. Code Style

- Functions over classes when no state is needed
- Composition over inheritance
- Small, focused modules with explicit exports
- `import type` for type-only imports
- Named exports over default exports

## Strict Configuration

Minimum recommended `tsconfig.json`:

```json
{
  "compilerOptions": {
    "strict": true,
    "target": "es2024",
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "isolatedModules": true,
    "skipLibCheck": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noUncheckedSideEffectImports": true,
    "verbatimModuleSyntax": true
  }
}
```

Key flags explained:

- `noUncheckedIndexedAccess` — index signatures return `T | undefined`
- `exactOptionalPropertyTypes` — distinguishes `undefined` from missing
- `verbatimModuleSyntax` — enforces explicit `import type` syntax
- `noUncheckedSideEffectImports` — verifies side-effect imports resolve (TS 5.6+)

## Type System Essentials

### Prefer Narrow Types

```typescript
// Bad — too wide
function processStatus(status: string): void { /* ... */ }

// Good — constrained
type Status = "pending" | "active" | "archived";
function processStatus(status: Status): void { /* ... */ }
```

### Discriminated Unions Over Conditionals

```typescript
// Bad — boolean flags with optional fields
interface ApiResponse {
  success: boolean;
  data?: User;
  error?: string;
}

// Good — each state is distinct and self-describing
type ApiResponse =
  | { status: "success"; data: User }
  | { status: "error"; error: string }
  | { status: "loading" };
```

### Use `satisfies` for Validated Inference

```typescript
// Bad — loses literal types
const config: Record<string, string> = {
  host: "localhost",
  port: "3000",
};
// config.host is string

// Good — validates shape, keeps literals
const config = {
  host: "localhost",
  port: "3000",
} satisfies Record<string, string>;
// config.host is "localhost"
```

### Branded Types for Nominal Safety

```typescript
type UserId = string & { readonly __brand: unique symbol };
type OrderId = string & { readonly __brand: unique symbol };

function createUserId(id: string): UserId {
  return id as UserId;
}

function getUser(id: UserId): User { /* ... */ }

const userId = createUserId("u-123");
const orderId = createOrderId("o-456");
getUser(orderId); // Error! OrderId is not UserId
```

### `readonly` by Default

```typescript
// Prefer readonly for function parameters
function processItems(items: readonly Item[]): Result {
  // items.push(...) would be an error
  return items.map(transform);
}

// Use Readonly<T> for objects
function updateConfig(
  current: Readonly<Config>,
  patch: Partial<Config>,
): Config {
  return { ...current, ...patch };
}
```

### Const Type Parameters (TS 5.0+)

```typescript
// Without const — infers string[]
function createRoute<T extends readonly string[]>(parts: T) { /* ... */ }
createRoute(["users", "profile"]); // T is string[]

// With const — infers literal tuple
function createRoute<const T extends readonly string[]>(parts: T) { /* ... */ }
createRoute(["users", "profile"]); // T is readonly ["users", "profile"]
```

### Resource Management with `using` (TS 5.2+)

```typescript
function processFile(path: string): string {
  using handle = openFile(path);
  return handle.readAll();
  // handle[Symbol.dispose]() called automatically
}

async function withConnection(): Promise<QueryResult> {
  await using conn = await pool.getConnection();
  return conn.query("SELECT ...");
  // conn[Symbol.asyncDispose]() called automatically
}
```

### NoInfer for Controlled Inference (TS 5.4+)

```typescript
// Without NoInfer — initial widens the union
function createFSM<S extends string>(
  initial: S,
  states: S[],
): void { /* ... */ }
createFSM("typo", ["idle", "running"]); // No error — S becomes "typo" | "idle" | "running"

// With NoInfer — only states drives inference
function createFSM<S extends string>(
  initial: NoInfer<S>,
  states: S[],
): void { /* ... */ }
createFSM("typo", ["idle", "running"]); // Error: "typo" not assignable
```

## Error Handling

### Use Result Types Over Exceptions

```typescript
type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };

function parseConfig(raw: string): Result<Config, ParseError> {
  try {
    const data = JSON.parse(raw);
    return { ok: true, value: validate(data) };
  } catch (e) {
    return { ok: false, error: new ParseError(e) };
  }
}

// Caller must handle both cases
const result = parseConfig(input);
if (result.ok) {
  useConfig(result.value);
} else {
  log(result.error);
}
```

### Type-Safe Error Narrowing

```typescript
// Always narrow unknown in catch
try {
  riskyOperation();
} catch (error: unknown) {
  if (error instanceof NetworkError) {
    retry(error.url);
  } else if (error instanceof ValidationError) {
    showErrors(error.fields);
  } else {
    throw error;
  }
}
```

## Module Patterns

### Explicit Named Exports

```typescript
// Prefer named exports
export function createUser(data: UserInput): User { /* ... */ }
export type { User, UserInput };

// Avoid default exports — harder to rename, worse tree-shaking
```

### Barrel Files — Use Sparingly

```typescript
// index.ts — only for public API surface
export { createUser, updateUser } from "./user.js";
export type { User, UserInput } from "./types.js";

// Don't re-export everything — it defeats tree-shaking
```

### Type-Only Import Enforcement

```typescript
// With verbatimModuleSyntax, this is enforced:
import type { User } from "./types.js";           // Type-only — erased
import { createUser } from "./user.js";            // Value — kept
import { type Config, loadConfig } from "./config.js"; // Mixed
```

## Common Anti-Patterns

| Anti-Pattern | Better Alternative |
|---|---|
| `any` | `unknown` with narrowing |
| Type assertions (`as T`) | `satisfies`, type guards |
| `enum` | Union types or `as const` objects |
| Class hierarchies for data | Discriminated unions |
| `!` non-null assertion | Proper null checks or `?.` |
| `Function` type | Specific signature `(arg: T) => R` |
| `Object` / `{}` type | `Record<string, unknown>` |
| Nested ternaries in types | Named helper types |
| `@ts-ignore` | `@ts-expect-error` (fails when fixed) |
| `interface extends` chains | Intersection types or composition |

## When to Annotate vs. Infer

**Annotate:**

- Function return types (public API)
- Complex object parameters
- Generic constraints
- Exported constants with specific types

**Let TypeScript infer:**

- Local variables
- Array method chains (`.map`, `.filter`)
- Simple function returns (private/internal)
- `const` declarations with literal values

## Exhaustive Checking

```typescript
function assertNever(value: never): never {
  throw new Error(`Unexpected value: ${value}`);
}

function handleStatus(status: Status): string {
  switch (status) {
    case "pending": return "Waiting...";
    case "active": return "Running";
    case "archived": return "Done";
    default: return assertNever(status); // Compile error if a case is missed
  }
}
```

## Deep Reference

For detailed guides on specific topics:

- **[Type System Patterns](reference/type-system.md)** — Generics, conditional types, mapped types, template literals, type guards
- **[Code Patterns & Idioms](reference/patterns-and-idioms.md)** — Functional patterns, builder pattern, immutable state, async patterns
- **[Modern Features Guide](reference/modern-features.md)** — Comprehensive TS 5.0-5.9 feature reference

## Limitations

- This skill provides guidance, not enforcement — use ESLint + typescript-eslint for automated checks
- Patterns are runtime-agnostic — some may need adaptation for specific frameworks
- TypeScript evolves rapidly — check the [official release notes](https://devblogs.microsoft.com/typescript/) for the latest
