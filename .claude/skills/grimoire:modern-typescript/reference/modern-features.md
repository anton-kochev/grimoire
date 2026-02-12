# Modern Features Guide — TypeScript 5.0 to 5.9

## Table of Contents

- [TypeScript 5.0](#typescript-50)
- [TypeScript 5.1](#typescript-51)
- [TypeScript 5.2](#typescript-52)
- [TypeScript 5.3](#typescript-53)
- [TypeScript 5.4](#typescript-54)
- [TypeScript 5.5](#typescript-55)
- [TypeScript 5.6](#typescript-56)
- [TypeScript 5.7](#typescript-57)
- [TypeScript 5.8](#typescript-58)
- [TypeScript 5.9](#typescript-59)
- [Looking Ahead: TypeScript 7](#looking-ahead-typescript-7)

## TypeScript 5.0

### Decorators (Stage 3 Standard)

TC39-compliant decorators replacing the experimental decorator implementation.

```typescript
function logged(target: Function, context: ClassMethodDecoratorContext) {
  const name = String(context.name);
  return function (this: unknown, ...args: unknown[]) {
    console.log(`Calling ${name}`);
    return (target as Function).apply(this, args);
  };
}

class UserService {
  @logged
  getUser(id: string): User { /* ... */ }
}
```

### `const` Type Parameters

Infer literal types from generic arguments without requiring `as const` at call sites.

```typescript
function createRoutes<const T extends Record<string, string>>(routes: T): T {
  return routes;
}

// Infers { readonly home: "/"; readonly about: "/about" }
const routes = createRoutes({ home: "/", about: "/about" });
```

### `satisfies` Operator

Validates that an expression matches a type without widening the inferred type.

```typescript
type Color = "red" | "green" | "blue";
type ColorMap = Record<Color, string | [number, number, number]>;

const palette = {
  red: [255, 0, 0],
  green: "#00ff00",
  blue: [0, 0, 255],
} satisfies ColorMap;

// palette.green is string (not string | number[])
palette.green.toUpperCase(); // OK
```

### Enum Improvements

All enums are now union enums, and enum members can be computed from other enum values.

### `--moduleResolution bundler`

New module resolution mode for bundler-based workflows (Vite, esbuild, webpack).

## TypeScript 5.1

### Easier Implicit Returns for `undefined`

Functions returning `undefined` no longer need an explicit `return` statement.

```typescript
function log(msg: string): undefined {
  console.log(msg);
  // No return needed
}
```

### Unlinked Type Predicates for Getters/Setters

Getters and setters can now have unrelated types.

```typescript
class Box {
  #value: unknown;

  get value(): string {
    return String(this.#value);
  }

  set value(newValue: string | number | boolean) {
    this.#value = newValue;
  }
}
```

## TypeScript 5.2

### `using` Declarations (Explicit Resource Management)

Deterministic cleanup of resources when they go out of scope.

```typescript
class TempFile implements Disposable {
  #path: string;

  constructor(path: string) {
    this.#path = path;
    writeFileSync(path, "");
  }

  write(data: string): void {
    appendFileSync(this.#path, data);
  }

  [Symbol.dispose](): void {
    unlinkSync(this.#path);
  }
}

function processTempData(): void {
  using tmp = new TempFile("/tmp/work.dat");
  tmp.write("data");
  // tmp is automatically deleted when scope exits
}
```

### `await using` for Async Disposal

```typescript
class DbConnection implements AsyncDisposable {
  async [Symbol.asyncDispose](): Promise<void> {
    await this.close();
  }
}

async function query(): Promise<Result> {
  await using conn = await pool.acquire();
  return conn.execute("SELECT 1");
  // Connection returned to pool automatically
}
```

### Decorator Metadata

Access metadata set by decorators via `Symbol.metadata`.

## TypeScript 5.3

### `import` Attributes

Support for import attributes (JSON modules, CSS modules).

```typescript
import config from "./config.json" with { type: "json" };
```

### `switch (true)` Narrowing

TypeScript now narrows types within `switch (true)` patterns.

```typescript
function describe(value: string | number | boolean): string {
  switch (true) {
    case typeof value === "string":
      return value.toUpperCase(); // value is string
    case typeof value === "number":
      return value.toFixed(2); // value is number
    default:
      return String(value);
  }
}
```

## TypeScript 5.4

### `NoInfer<T>` Utility Type

Prevents a type parameter position from contributing to inference.

```typescript
function createStreetLight<C extends string>(
  colors: C[],
  defaultColor: NoInfer<C>,
): void { /* ... */ }

createStreetLight(["red", "yellow", "green"], "red"); // OK
createStreetLight(["red", "yellow", "green"], "blue"); // Error
```

### Preserved Narrowing in Closures

Variables narrowed in the containing scope remain narrowed inside closures when the variable isn't reassigned.

```typescript
function process(value: string | null) {
  if (value !== null) {
    // value is narrowed to string
    setTimeout(() => {
      console.log(value.length); // Still narrowed in closure
    }, 100);
  }
}
```

### `Object.groupBy` and `Map.groupBy` Types

```typescript
const grouped = Object.groupBy(users, (user) => user.role);
// Record<string, User[]>
```

## TypeScript 5.5

### Inferred Type Predicates

TypeScript automatically infers type predicates for functions that narrow types.

```typescript
// Before 5.5 — required explicit annotation
function isString(x: unknown): x is string {
  return typeof x === "string";
}

// 5.5+ — inferred automatically
const strings = values.filter((v) => typeof v === "string");
// Correctly typed as string[]

const nonNull = items.filter((item) => item != null);
// Correctly typed as NonNullable<T>[]
```

### Regular Expression Checking

TypeScript validates regular expression syntax at compile time.

```typescript
const re = /(?<=\d+)\s+/; // Validated at compile time
const bad = /(?<=/;        // Error: unterminated regex
```

### Isolated Declarations

New `--isolatedDeclarations` flag ensures `.d.ts` files can be generated without type checking.

## TypeScript 5.6

### Disallowed Nullish and Truthy Checks

TypeScript errors on always-truthy or always-nullish checks to catch bugs.

```typescript
function check(x: string) {
  if (x) { /* OK — string can be falsy ("") */ }
}

function check2(x: () => boolean) {
  // Error — function reference is always truthy
  // Did you mean to call it? x()
  if (x) { /* ... */ }
}
```

### `--noUncheckedSideEffectImports`

Verifies that side-effect imports (`import "./setup"`) actually resolve to existing files.

### Iterator Helper Methods

Built-in support for iterator helpers like `.map()`, `.filter()`, `.take()` on iterators.

```typescript
function* naturals() {
  let n = 0;
  while (true) yield n++;
}

const firstTenEvens = naturals()
  .filter((n) => n % 2 === 0)
  .take(10)
  .toArray();
```

## TypeScript 5.7

### Never-Initialized Variable Checks

Detects variables used before assignment even when accessed inside nested functions.

```typescript
function example() {
  let value: string;

  function inner() {
    console.log(value); // Error: used before assigned
  }

  inner();
  value = "hello";
}
```

### `--target es2024`

Enables `Object.groupBy`, `Map.groupBy`, `Promise.withResolvers`, and enhanced `ArrayBuffer` / `SharedArrayBuffer` support.

### `--rewriteRelativeImportExtensions`

Automatically rewrites `.ts` → `.js`, `.mts` → `.mjs`, `.cts` → `.cjs` in relative imports during compilation.

### JSON Import Validation

Under `--module nodenext`, JSON imports require `with { type: "json" }` and only support default exports.

```typescript
import config from "./config.json" with { type: "json" };
// config.setting — OK
```

### V8 Compile Caching

Leverages Node.js 22's `module.enableCompileCache()` for ~2.5x faster startup.

## TypeScript 5.8

### Granular Return Expression Checks

Each branch of a conditional return expression is independently checked against the declared return type.

```typescript
function process(input: string): number {
  // Each branch checked separately for return type compatibility
  return input.length > 0
    ? parseInt(input) // checked: number ← OK
    : "default";      // checked: string ← Error!
}
```

### Performance Optimizations

Build and watch mode performance improvements for large codebases.

## TypeScript 5.9

### Clean Default Configuration

`tsc --init` generates sensible defaults: `"module": "nodenext"`, `"target": "esnext"`, and strict type-checking enabled out of the box.

### Conditional Return Types (Refined)

Improved checking of functions with conditional return types based on parameter types.

## Looking Ahead: TypeScript 7

Microsoft is rewriting the TypeScript compiler in Go (`tsgo`) for 8-10x performance improvements. Key points:

- **TypeScript 6.x** — Continues the JS-based compiler with deprecations and breaking changes to align with the native codebase
- **TypeScript 7.0** — First fully native release, targeting early 2026
- **Backwards compatible** — Same TypeScript language, dramatically faster tooling
- **`tsgo`** available for early testing now

The language features and best practices in this guide will continue to work unchanged in TypeScript 7.
