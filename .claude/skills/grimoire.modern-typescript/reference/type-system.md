# Type System Patterns

## Table of Contents

- [Generics Best Practices](#generics-best-practices)
- [Conditional Types](#conditional-types)
- [Mapped Types](#mapped-types)
- [Template Literal Types](#template-literal-types)
- [Type Guards and Narrowing](#type-guards-and-narrowing)
- [Utility Type Recipes](#utility-type-recipes)
- [Recursive Types](#recursive-types)

## Generics Best Practices

### Constrain Early, Infer Late

```typescript
// Bad — too loose
function getProperty<T>(obj: T, key: string): unknown {
  return (obj as Record<string, unknown>)[key];
}

// Good — constrained and type-safe
function getProperty<T, K extends keyof T>(obj: T, key: K): T[K] {
  return obj[key];
}
```

### Name Generic Parameters Meaningfully

```typescript
// Bad — single-letter overload
function transform<T, U, V>(input: T, fn: (x: U) => V): V { /* ... */ }

// Good — descriptive names for complex generics
function transform<TInput, TIntermediate, TOutput>(
  input: TInput,
  fn: (x: TIntermediate) => TOutput,
): TOutput { /* ... */ }

// Single-letter is fine for simple, well-understood generics
function identity<T>(value: T): T { return value; }
```

### Use `const` Type Parameters for Literal Inference

```typescript
function createConfig<const T extends Record<string, unknown>>(config: T): T {
  return config;
}

// Infers { readonly host: "localhost"; readonly port: 3000 }
const cfg = createConfig({ host: "localhost", port: 3000 });
```

### Default Type Parameters

```typescript
interface EventEmitter<TEvents extends Record<string, unknown[]> = Record<string, unknown[]>> {
  on<K extends keyof TEvents>(event: K, handler: (...args: TEvents[K]) => void): void;
  emit<K extends keyof TEvents>(event: K, ...args: TEvents[K]): void;
}

// Works without explicit type argument
const emitter: EventEmitter = createEmitter();

// Or with specific events
interface AppEvents {
  login: [userId: string];
  error: [code: number, message: string];
}
const app: EventEmitter<AppEvents> = createEmitter();
```

### Avoid Over-Generification

```typescript
// Bad — generic adds no value here
function add<T extends number>(a: T, b: T): number {
  return a + b;
}

// Good — simple parameter types when generics don't help
function add(a: number, b: number): number {
  return a + b;
}
```

## Conditional Types

### Basic Pattern

```typescript
type IsString<T> = T extends string ? true : false;

type A = IsString<"hello">; // true
type B = IsString<42>;      // false
```

### Extracting from Unions

```typescript
// Extract only string members from a union
type StringMembers<T> = T extends string ? T : never;

type Mixed = "hello" | 42 | "world" | true;
type OnlyStrings = StringMembers<Mixed>; // "hello" | "world"
```

### `infer` for Type Extraction

```typescript
// Extract return type of a function
type ReturnOf<T> = T extends (...args: unknown[]) => infer R ? R : never;

// Extract element type from array
type ElementOf<T> = T extends readonly (infer E)[] ? E : never;

// Extract promise value
type Awaited<T> = T extends Promise<infer V> ? Awaited<V> : T;

// Extract specific tuple positions
type First<T> = T extends [infer F, ...unknown[]] ? F : never;
type Last<T> = T extends [...unknown[], infer L] ? L : never;
```

### Distributive vs. Non-Distributive

```typescript
// Distributive — applies to each union member separately
type ToArray<T> = T extends unknown ? T[] : never;
type Result = ToArray<string | number>; // string[] | number[]

// Non-distributive — wrapping in tuple prevents distribution
type ToArrayND<T> = [T] extends [unknown] ? T[] : never;
type Result2 = ToArrayND<string | number>; // (string | number)[]
```

## Mapped Types

### Basic Transformation

```typescript
// Make all properties optional
type Optional<T> = { [K in keyof T]?: T[K] };

// Make all properties required
type Required<T> = { [K in keyof T]-?: T[K] };

// Make all properties readonly
type Immutable<T> = { readonly [K in keyof T]: T[K] };
```

### Key Remapping with `as`

```typescript
// Prefix all keys
type Prefixed<T, P extends string> = {
  [K in keyof T as `${P}${string & K}`]: T[K];
};

interface User { name: string; age: number }
type PrefixedUser = Prefixed<User, "user_">;
// { user_name: string; user_age: number }
```

### Filtering Properties

```typescript
// Keep only string-valued properties
type StringProps<T> = {
  [K in keyof T as T[K] extends string ? K : never]: T[K];
};

interface Mixed { name: string; age: number; email: string }
type OnlyStrings = StringProps<Mixed>;
// { name: string; email: string }
```

### Deep Readonly

```typescript
type DeepReadonly<T> = T extends Function
  ? T
  : T extends object
    ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
    : T;
```

## Template Literal Types

### Event System

```typescript
type EventName = "click" | "hover" | "focus";
type HandlerName = `on${Capitalize<EventName>}`;
// "onClick" | "onHover" | "onFocus"

type EventHandlers = {
  [K in EventName as `on${Capitalize<K>}`]: (event: Event) => void;
};
```

### Route Parameters

```typescript
type ExtractParams<T extends string> =
  T extends `${string}:${infer Param}/${infer Rest}`
    ? { [K in Param | keyof ExtractParams<Rest>]: string }
    : T extends `${string}:${infer Param}`
      ? { [K in Param]: string }
      : Record<string, never>;

type Params = ExtractParams<"/users/:userId/posts/:postId">;
// { userId: string; postId: string }
```

### String Manipulation Types

```typescript
// Built-in intrinsic types
type Upper = Uppercase<"hello">;       // "HELLO"
type Lower = Lowercase<"HELLO">;       // "hello"
type Cap = Capitalize<"hello">;        // "Hello"
type Uncap = Uncapitalize<"Hello">;    // "hello"

// Combine for conventions
type CamelToSnake<S extends string> =
  S extends `${infer Head}${infer Tail}`
    ? Tail extends Uncapitalize<Tail>
      ? `${Lowercase<Head>}${CamelToSnake<Tail>}`
      : `${Lowercase<Head>}_${CamelToSnake<Tail>}`
    : S;
```

## Type Guards and Narrowing

### Custom Type Guards

```typescript
// Type predicate — explicitly declares narrowing
function isUser(value: unknown): value is User {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    "name" in value
  );
}

// Assertion function — throws or narrows
function assertUser(value: unknown): asserts value is User {
  if (!isUser(value)) {
    throw new TypeError("Expected User");
  }
}
```

### Inferred Type Predicates (TS 5.5+)

```typescript
// TypeScript now infers the type predicate automatically
const users = items.filter((item) => item.type === "user");
// Inferred as User[] — no explicit type guard needed

// Also works with nullish filtering
const nonNull = items.filter((item) => item != null);
// Inferred as NonNullable<T>[]
```

### Narrowing Patterns

```typescript
// `in` operator narrows
function handle(shape: Circle | Square) {
  if ("radius" in shape) {
    // shape is Circle
  }
}

// typeof narrows
function process(value: string | number) {
  if (typeof value === "string") {
    // value is string
  }
}

// instanceof narrows
function handleError(error: unknown) {
  if (error instanceof TypeError) {
    // error is TypeError
  }
}

// Discriminant property narrows
function handleResult(result: Result<User>) {
  if (result.ok) {
    // result is { ok: true; value: User }
  }
}
```

## Utility Type Recipes

### Pick and Omit Variants

```typescript
// Pick only required properties
type RequiredKeys<T> = {
  [K in keyof T]-?: undefined extends T[K] ? never : K;
}[keyof T];

type RequiredPick<T> = Pick<T, RequiredKeys<T>>;

// Make specific properties optional
type PartialBy<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

// Make specific properties required
type RequiredBy<T, K extends keyof T> = Omit<T, K> & Required<Pick<T, K>>;
```

### Strict Omit

```typescript
// Built-in Omit doesn't check keys — this one does
type StrictOmit<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>;
```

### Union to Intersection

```typescript
type UnionToIntersection<U> =
  (U extends unknown ? (arg: U) => void : never) extends (arg: infer I) => void
    ? I
    : never;
```

### Merge Types

```typescript
// Like intersection but shows resolved keys in IDE
type Merge<A, B> = {
  [K in keyof A | keyof B]: K extends keyof B
    ? B[K]
    : K extends keyof A
      ? A[K]
      : never;
};
```

## Recursive Types

### Deep Partial

```typescript
type DeepPartial<T> = T extends object
  ? { [K in keyof T]?: DeepPartial<T[K]> }
  : T;
```

### JSON Type

```typescript
type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };
```

### Nested Path Types

```typescript
type Path<T, K extends keyof T = keyof T> = K extends string
  ? T[K] extends object
    ? K | `${K}.${Path<T[K]>}`
    : K
  : never;

interface Config {
  db: { host: string; port: number };
  app: { name: string };
}

type ConfigPaths = Path<Config>;
// "db" | "db.host" | "db.port" | "app" | "app.name"
```
