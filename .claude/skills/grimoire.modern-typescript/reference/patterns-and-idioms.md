# Code Patterns & Idioms

## Table of Contents

- [Functional Patterns](#functional-patterns)
- [Builder Pattern](#builder-pattern)
- [State Machines](#state-machines)
- [Immutable Data Patterns](#immutable-data-patterns)
- [Async Patterns](#async-patterns)
- [Dependency Injection](#dependency-injection)
- [Module Organization](#module-organization)

## Functional Patterns

### Pipe and Compose

```typescript
// Type-safe pipe (left to right)
function pipe<A, B>(fn1: (a: A) => B): (a: A) => B;
function pipe<A, B, C>(fn1: (a: A) => B, fn2: (b: B) => C): (a: A) => C;
function pipe<A, B, C, D>(
  fn1: (a: A) => B,
  fn2: (b: B) => C,
  fn3: (c: C) => D,
): (a: A) => D;
function pipe(...fns: Function[]) {
  return (arg: unknown) => fns.reduce((acc, fn) => fn(acc), arg);
}

// Usage
const processUser = pipe(
  validateInput,
  normalizeEmail,
  createUser,
);
```

### Option / Maybe Pattern

```typescript
type Option<T> = Some<T> | None;
interface Some<T> { readonly _tag: "Some"; readonly value: T }
interface None { readonly _tag: "None" }

const some = <T>(value: T): Option<T> => ({ _tag: "Some", value });
const none: Option<never> = { _tag: "None" };

function map<A, B>(opt: Option<A>, fn: (a: A) => B): Option<B> {
  return opt._tag === "Some" ? some(fn(opt.value)) : none;
}

function flatMap<A, B>(opt: Option<A>, fn: (a: A) => Option<B>): Option<B> {
  return opt._tag === "Some" ? fn(opt.value) : none;
}

function getOrElse<T>(opt: Option<T>, fallback: () => T): T {
  return opt._tag === "Some" ? opt.value : fallback();
}
```

### Exhaustive Pattern Matching

```typescript
type Shape =
  | { kind: "circle"; radius: number }
  | { kind: "rect"; width: number; height: number }
  | { kind: "triangle"; base: number; height: number };

function area(shape: Shape): number {
  switch (shape.kind) {
    case "circle":
      return Math.PI * shape.radius ** 2;
    case "rect":
      return shape.width * shape.height;
    case "triangle":
      return (shape.base * shape.height) / 2;
    default: {
      const _exhaustive: never = shape;
      throw new Error(`Unhandled shape: ${_exhaustive}`);
    }
  }
}
```

### Currying

```typescript
function curry<A, B, C>(fn: (a: A, b: B) => C): (a: A) => (b: B) => C {
  return (a) => (b) => fn(a, b);
}

const multiply = curry((a: number, b: number) => a * b);
const double = multiply(2);
double(5); // 10
```

## Builder Pattern

### Type-Safe Builder with Required Fields

```typescript
interface QueryConfig {
  table: string;
  select: string[];
  where?: string;
  limit?: number;
  orderBy?: string;
}

type RequiredFields = "table" | "select";

class QueryBuilder<Built extends string = never> {
  private config: Partial<QueryConfig> = {};

  table(name: string): QueryBuilder<Built | "table"> {
    this.config.table = name;
    return this as QueryBuilder<Built | "table">;
  }

  select(...fields: string[]): QueryBuilder<Built | "select"> {
    this.config.select = fields;
    return this as QueryBuilder<Built | "select">;
  }

  where(condition: string): this {
    this.config.where = condition;
    return this;
  }

  limit(n: number): this {
    this.config.limit = n;
    return this;
  }

  // Only callable when all required fields are set
  build(this: QueryBuilder<RequiredFields>): QueryConfig {
    return this.config as QueryConfig;
  }
}

// Usage — build() only available after table() and select()
const query = new QueryBuilder()
  .table("users")
  .select("id", "name")
  .where("active = true")
  .build(); // OK

// new QueryBuilder().select("id").build(); // Error — missing table()
```

### Fluent Configuration

```typescript
function createServer() {
  const config = {
    port: 3000,
    host: "localhost",
    cors: false,
  };

  const builder = {
    port(p: number) { config.port = p; return builder; },
    host(h: string) { config.host = h; return builder; },
    cors(enabled: boolean) { config.cors = enabled; return builder; },
    build() { return Object.freeze(config); },
  };

  return builder;
}

const server = createServer()
  .port(8080)
  .cors(true)
  .build();
```

## State Machines

### Discriminated Union State Machine

```typescript
type ConnectionState =
  | { status: "disconnected" }
  | { status: "connecting"; attempt: number }
  | { status: "connected"; socket: WebSocket }
  | { status: "error"; error: Error; retryAfter: number };

type ConnectionEvent =
  | { type: "CONNECT" }
  | { type: "CONNECTED"; socket: WebSocket }
  | { type: "DISCONNECT" }
  | { type: "ERROR"; error: Error };

function transition(
  state: ConnectionState,
  event: ConnectionEvent,
): ConnectionState {
  switch (state.status) {
    case "disconnected":
      if (event.type === "CONNECT") {
        return { status: "connecting", attempt: 1 };
      }
      return state;

    case "connecting":
      if (event.type === "CONNECTED") {
        return { status: "connected", socket: event.socket };
      }
      if (event.type === "ERROR") {
        return {
          status: "error",
          error: event.error,
          retryAfter: state.attempt * 1000,
        };
      }
      return state;

    case "connected":
      if (event.type === "DISCONNECT") {
        return { status: "disconnected" };
      }
      if (event.type === "ERROR") {
        return { status: "error", error: event.error, retryAfter: 1000 };
      }
      return state;

    case "error":
      if (event.type === "CONNECT") {
        return { status: "connecting", attempt: 1 };
      }
      return state;
  }
}
```

## Immutable Data Patterns

### Immutable Updates

```typescript
// Spread for shallow updates
function updateUser(user: Readonly<User>, patch: Partial<User>): User {
  return { ...user, ...patch };
}

// Nested updates with helper
function updateNested<T extends object, K extends keyof T>(
  obj: Readonly<T>,
  key: K,
  updater: (value: T[K]) => T[K],
): T {
  return { ...obj, [key]: updater(obj[key]) };
}

// Usage
const updated = updateNested(state, "settings", (s) => ({
  ...s,
  theme: "dark",
}));
```

### Readonly Collections

```typescript
// Immutable map operations
function mapSet<K, V>(
  map: ReadonlyMap<K, V>,
  key: K,
  value: V,
): ReadonlyMap<K, V> {
  const copy = new Map(map);
  copy.set(key, value);
  return copy;
}

function mapDelete<K, V>(
  map: ReadonlyMap<K, V>,
  key: K,
): ReadonlyMap<K, V> {
  const copy = new Map(map);
  copy.delete(key);
  return copy;
}
```

### `as const` for Frozen Data

```typescript
const PERMISSIONS = {
  admin: ["read", "write", "delete"],
  editor: ["read", "write"],
  viewer: ["read"],
} as const;

// Type is deeply readonly with literal types
type Role = keyof typeof PERMISSIONS;
type Permission = (typeof PERMISSIONS)[Role][number];
// "read" | "write" | "delete"
```

## Async Patterns

### Typed Async Utilities

```typescript
// Promise with timeout
function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
): Promise<T> {
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms),
  );
  return Promise.race([promise, timeout]);
}

// Retry with backoff
async function retry<T>(
  fn: () => Promise<T>,
  options: { attempts: number; delay: number },
): Promise<T> {
  for (let i = 0; i < options.attempts; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === options.attempts - 1) throw error;
      await new Promise((r) => setTimeout(r, options.delay * 2 ** i));
    }
  }
  throw new Error("Unreachable");
}
```

### AsyncIterable Patterns

```typescript
// Async generator for paginated APIs
async function* paginate<T>(
  fetchPage: (cursor?: string) => Promise<{ data: T[]; next?: string }>,
): AsyncGenerator<T> {
  let cursor: string | undefined;
  do {
    const page = await fetchPage(cursor);
    yield* page.data;
    cursor = page.next;
  } while (cursor);
}

// Usage
for await (const user of paginate(fetchUsers)) {
  process(user);
}
```

### Concurrent Task Limiter

```typescript
async function mapConcurrent<T, R>(
  items: readonly T[],
  fn: (item: T) => Promise<R>,
  concurrency: number,
): Promise<R[]> {
  const results: R[] = [];
  const executing = new Set<Promise<void>>();

  for (const [index, item] of items.entries()) {
    const task = fn(item).then((result) => {
      results[index] = result;
    });

    const tracked = task.then(() => executing.delete(tracked));
    executing.add(tracked);

    if (executing.size >= concurrency) {
      await Promise.race(executing);
    }
  }

  await Promise.all(executing);
  return results;
}
```

## Dependency Injection

### Function-Based DI

```typescript
// Define dependencies as an interface
interface Dependencies {
  logger: Logger;
  db: Database;
  cache: Cache;
}

// Functions accept dependencies explicitly
function createUserService(deps: Dependencies) {
  return {
    async getUser(id: string): Promise<User | null> {
      const cached = await deps.cache.get<User>(`user:${id}`);
      if (cached) return cached;

      const user = await deps.db.query<User>("SELECT * FROM users WHERE id = $1", [id]);
      if (user) await deps.cache.set(`user:${id}`, user);
      return user;
    },
  };
}

// Wire up at composition root
const deps: Dependencies = { logger, db, cache };
const userService = createUserService(deps);
```

### Token-Based DI (for larger applications)

```typescript
// Branded tokens for type safety
type Token<T> = symbol & { __type: T };

function createToken<T>(description: string): Token<T> {
  return Symbol(description) as Token<T>;
}

const TOKENS = {
  Logger: createToken<Logger>("Logger"),
  Database: createToken<Database>("Database"),
} as const;

class Container {
  private bindings = new Map<symbol, unknown>();

  bind<T>(token: Token<T>, factory: () => T): void {
    this.bindings.set(token, factory);
  }

  get<T>(token: Token<T>): T {
    const factory = this.bindings.get(token) as (() => T) | undefined;
    if (!factory) throw new Error(`No binding for ${token.toString()}`);
    return factory();
  }
}
```

## Module Organization

### Feature-Based Structure

```
src/
├── features/
│   ├── users/
│   │   ├── index.ts          # Public API
│   │   ├── types.ts          # Feature types
│   │   ├── service.ts        # Business logic
│   │   ├── repository.ts     # Data access
│   │   └── validation.ts     # Input validation
│   └── orders/
│       ├── index.ts
│       └── ...
├── shared/
│   ├── types.ts              # Shared types
│   ├── errors.ts             # Error classes
│   └── utils.ts              # Pure utility functions
└── index.ts                  # App entry point
```

### Encapsulation via Index Exports

```typescript
// features/users/index.ts — public API only
export { createUser, getUser, updateUser } from "./service.js";
export type { User, CreateUserInput } from "./types.js";

// Internal modules (service.ts, repository.ts) are NOT exported
// Other features import only from the index
```
