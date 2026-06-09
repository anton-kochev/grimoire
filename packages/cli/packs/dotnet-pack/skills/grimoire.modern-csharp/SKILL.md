---
name: grimoire.modern-csharp
description: "Microsoft's current best practices for writing performant and robust C# on modern .NET (C# 12/13/14, .NET 8/9/10). Use when writing or reviewing C# for correctness and speed — nullable reference types, records and immutability, pattern matching, async/await correctness (ConfigureAwait, ValueTask, cancellation, IAsyncEnumerable), deterministic disposal, and high-performance code with Span, ArrayPool, frozen collections, SearchValues, and source-generated JSON. Includes compile-time logging via the LoggerMessage source generator and the other zero-cost source generators. Triggers: modern C#, C# 12, C# 13, C# 14, .NET 8, .NET 9, .NET 10, performance, allocations, nullable reference types, records, pattern matching, async await, ConfigureAwait, ValueTask, cancellation token, IAsyncEnumerable, IDisposable, Span, Memory, stackalloc, ArrayPool, FrozenDictionary, SearchValues, compile-time logging, LoggerMessage, source generator, GeneratedRegex, BenchmarkDotNet."
---

# Modern C# — performant & robust

Microsoft's current guidance for writing fast, correct C#. Examples target **.NET 10** (current LTS, Nov 2025) and C# 14, and note where behavior differs by version. The focus is the **language and runtime** — not web APIs or testing, which have their own skills.

This skill provides guidance, not enforcement. Check the project's `TargetFramework`, `<LangVersion>`, and existing patterns first, and match them. Don't rewrite working code into a new idiom unless asked.

> Constructor note: prefer **traditional constructors** with `readonly` fields over primary constructors throughout. Primary constructors are valid C#, but examples here use explicit constructors.

## Project defaults to set first

These belong in the `.csproj` (or `Directory.Build.props`) before any other advice matters:

```xml
<PropertyGroup>
  <TargetFramework>net10.0</TargetFramework>
  <Nullable>enable</Nullable>              <!-- non-null by default; opt into null with ? -->
  <ImplicitUsings>enable</ImplicitUsings>  <!-- common System.* usings auto-included -->
  <LangVersion>latest</LangVersion>
  <TreatWarningsAsErrors>true</TreatWarningsAsErrors>  <!-- promote nullable/analyzer warnings -->
  <AnalysisLevel>latest-recommended</AnalysisLevel>
</PropertyGroup>
```

Nullable enabled is the single highest-leverage setting — it turns a whole class of `NullReferenceException` into compile-time warnings.

## Robustness quick-reference

| Rule | Do this |
|---|---|
| Express nullability in the type | Non-null by default; mark genuinely-optional refs with `?`. Avoid `!` (null-forgiving) unless you can prove the compiler wrong. |
| Validate at the boundary | `ArgumentNullException.ThrowIfNull(arg)`, `ArgumentException.ThrowIfNullOrEmpty(s)`, `ArgumentOutOfRangeException.ThrowIfNegative(n)`. Fail fast, leave only the happy path below. |
| Model data as immutable | `record` for data; `readonly record struct` for small values; `required` + `init` for set-once properties. Use `with` for non-destructive copies. |
| Prefer `Try*` over throw on hot paths | `int.TryParse`, `dict.TryGetValue` — exceptions are for the exceptional, not control flow. |
| Use pattern matching | `is`/`switch` expressions with `and`/`or`/`not`, property and list patterns — replaces cast-and-null-check ladders. |
| Modern file layout | File-scoped `namespace Foo;`, global usings in one `GlobalUsings.cs`. |
| Dispose deterministically | `using var` / `await using var`; implement `IAsyncDisposable` for async cleanup. |

→ Deep dive: **[reference/robustness.md](reference/robustness.md)**

## Async quick-reference

| Rule | Do this |
|---|---|
| Thread cancellation through | Accept `CancellationToken ct = default` and pass it to every async call below you. |
| `ConfigureAwait(false)` in libraries | Avoids capturing the context in reusable library code. Omit it in app/UI code that needs the context. |
| `ValueTask` only when measured | Use `Task` by default; reach for `ValueTask<T>` only in hot paths that frequently complete synchronously. Never await a `ValueTask` twice. |
| Never `async void` | Except UI event handlers — `async void` can't be awaited and its exceptions escape to the synchronization context. |
| Stream with `IAsyncEnumerable<T>` | `await foreach` for async sequences; mark the token `[EnumeratorCancellation]`. |
| Don't block on async | No `.Result` / `.Wait()` / `.GetAwaiter().GetResult()` — that's how you deadlock. |

→ Deep dive: **[reference/async-and-disposal.md](reference/async-and-disposal.md)**

## Performance quick-reference

Measure first (see BenchmarkDotNet below). Then, in order of impact:

| Rule | Do this |
|---|---|
| Cut allocations on hot paths | `Span<T>`/`ReadOnlySpan<T>` for slicing without copies; `stackalloc` for small temporary buffers (<~1 KB). |
| Pool large/repeated buffers | `ArrayPool<T>.Shared.Rent`/`Return` (in a `finally`), or `MemoryPool<T>`. |
| Pick struct vs class deliberately | `struct` only for small (≤~16 B), immutable, atomic values; make them `readonly`. Avoid boxing — constrain generics with `where T : struct`. |
| Build strings efficiently | `StringBuilder` for loops; pass values to structured logging instead of interpolating; `string.Create` for known-length builds. |
| Freeze read-heavy lookups | `FrozenDictionary`/`FrozenSet` (build once, read millions of times). `CollectionsMarshal` for advanced dictionary access. |
| Reuse search sets | `SearchValues<T>` (static readonly) for `IndexOfAny` over a fixed set — SIMD-accelerated. |
| Source-generate JSON | `JsonSerializerContext` — no reflection, faster startup, AOT-safe (see source generators). |

→ Deep dive: **[reference/performance.md](reference/performance.md)**

## Compile-time logging quick-reference

In .NET 6+, log through the **`[LoggerMessage]` source generator**, not `logger.LogInformation($"...")`. It's allocation-free, doesn't box value-type arguments, parses the template once at compile time, and emits structured logs.

```csharp
public static partial class Log
{
    [LoggerMessage(EventId = 1, Level = LogLevel.Information,
        Message = "Processed order {OrderId} for {CustomerId} in {ElapsedMs} ms")]
    public static partial void OrderProcessed(
        ILogger logger, string orderId, int customerId, long elapsedMs);
}

// call site
Log.OrderProcessed(logger, order.Id, order.CustomerId, sw.ElapsedMilliseconds);
```

- **PascalCase placeholders** (`{OrderId}`) — they become structured-log property names.
- **Guard expensive log payloads**: `if (logger.IsEnabled(LogLevel.Debug)) Log.Detail(logger, Expensive());`
- **Never string-interpolate** the message — pass values as parameters so sinks get structured data.
- First `Exception` parameter is logged as the exception, not a template arg.

→ Deep dive: **[reference/compile-time-logging.md](reference/compile-time-logging.md)**

## Source generators (zero runtime cost)

Prefer compile-time generation whenever the shape is known at build time — it removes reflection, speeds startup, and is trimming/AOT-safe.

| Generator | Replaces | Use for |
|---|---|---|
| `[LoggerMessage]` | `logger.LogX(...)` in hot paths | structured, allocation-free logging |
| `JsonSerializerContext` | reflection-based `System.Text.Json` | fast, AOT-safe (de)serialization |
| `[GeneratedRegex]` | `new Regex(...)` / `RegexOptions.Compiled` | compile-time-constant patterns |
| `[OptionsValidator]` | runtime DataAnnotations validation | options validation without reflection |
| `LibraryImport` | `DllImport` | P/Invoke with source-generated marshalling |

→ Deep dive: **[reference/source-generators.md](reference/source-generators.md)**

## Which reference file do I need?

| You're working on… | Open |
|---|---|
| Nullability, error handling, records, pattern matching, namespaces | `reference/robustness.md` |
| Async/await, cancellation, streams, `IDisposable`/`IAsyncDisposable` | `reference/async-and-disposal.md` |
| Allocations, `Span`, pooling, collections, strings, benchmarking | `reference/performance.md` |
| High-performance logging with `[LoggerMessage]` | `reference/compile-time-logging.md` |
| JSON / regex / options / P-Invoke source generators | `reference/source-generators.md` |

All recommendations cite their Microsoft Learn / .NET blog source in the reference files.
