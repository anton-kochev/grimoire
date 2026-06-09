# Robustness & correctness

Writing C# that fails at compile time instead of run time. Targets C# 12–14 on .NET 8/9/10.

## Contents

- [Nullable reference types](#nullable-reference-types)
- [Input validation & guard clauses](#input-validation--guard-clauses)
- [Error handling: exceptions vs `Try*`](#error-handling-exceptions-vs-try)
- [Records & immutability](#records--immutability)
- [Pattern matching](#pattern-matching)
- [File-scoped namespaces & global usings](#file-scoped-namespaces--global-usings)

---

## Nullable reference types

Enable project-wide (`<Nullable>enable</Nullable>`); on by default in templates since .NET 6. The compiler tracks null-state and warns when you dereference a maybe-null value. Declare references non-null by default and annotate genuinely-optional ones with `?`.

```csharp
public sealed class ProductDescription
{
    private readonly string _short;       // non-null: compiler enforces initialization
    private string? _detailed;            // explicitly nullable

    public ProductDescription(string shortText)
    {
        ArgumentNullException.ThrowIfNull(shortText);
        _short = shortText;
    }

    public void SetDetailed(string? details) => _detailed = details;

    // null-state analysis knows _detailed is non-null after the check
    public string Render() => _detailed is null ? _short : $"{_short}\n{_detailed}";
}
```

Guidance:
- Use `?` to express **design intent**, not to silence warnings.
- The null-forgiving operator `!` asserts "I know better than the compiler." Use it rarely and only when you genuinely have knowledge the flow analysis lacks (e.g. after `[MemberNotNull]`-style invariants). A codebase peppered with `!` has effectively disabled the feature.
- Annotate APIs with `[NotNullWhen(true)]`, `[MemberNotNull(...)]`, etc. so callers get accurate flow analysis across method boundaries.

Sources: [Nullable reference types](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/builtin-types/nullable-reference-types) · [Design with nullable reference types](https://learn.microsoft.com/en-us/dotnet/csharp/tutorials/nullable-reference-types)

---

## Input validation & guard clauses

Validate at the method boundary and fail fast. The static `Throw*` helpers keep guards to one line and produce good messages with the parameter name auto-captured.

```csharp
public void ProcessOrder(Order order, string couponCode, int quantity)
{
    ArgumentNullException.ThrowIfNull(order);
    ArgumentException.ThrowIfNullOrWhiteSpace(couponCode);
    ArgumentOutOfRangeException.ThrowIfNegativeOrZero(quantity);
    ArgumentOutOfRangeException.ThrowIfGreaterThan(quantity, order.MaxQuantity);

    // only the happy path remains below
}
```

Available helpers (most added across .NET 6–8): `ArgumentNullException.ThrowIfNull`, `ArgumentException.ThrowIfNullOrEmpty` / `ThrowIfNullOrWhiteSpace`, `ArgumentOutOfRangeException.ThrowIf{Negative,NegativeOrZero,Zero,GreaterThan,LessThan,Equal,...}`, `ObjectDisposedException.ThrowIf`.

Guard clauses invert the arrow-shaped code: each precondition returns/throws early so the body reads top-to-bottom as the success case.

Sources: [Exception best practices](https://learn.microsoft.com/en-us/dotnet/standard/exceptions/best-practices-for-exceptions)

---

## Error handling: exceptions vs `Try*`

Exceptions are for genuinely exceptional, unexpected conditions — not for control flow you expect to hit often (a throw/catch costs orders of magnitude more than a branch).

```csharp
// Hot path / expected-miss: use the Try pattern, no allocation on failure
if (!int.TryParse(input, out int id) || id <= 0)
    return Results.BadRequest("Invalid id");

if (!_cache.TryGetValue(key, out var cached))
    cached = await LoadAsync(key, ct);
```

When you do throw:
- Throw the **most specific** built-in type that fits (`ArgumentException`, `InvalidOperationException`, `FormatException`); create a custom exception only when callers need to catch *that* case distinctly.
- Catch from most-derived to least-derived; never `catch {}` an empty swallow; never `catch (Exception)` just to log and rethrow as a new type that loses the stack — use `throw;` not `throw ex;`.
- Use exception filters (`catch (HttpRequestException e) when (e.StatusCode == 429)`) instead of catch-and-rethrow.

A `Result`/discriminated-union style (returning success-or-error instead of throwing) is a reasonable pattern for expected domain failures and keeps the happy path allocation-light; it's a team choice, not a Microsoft default. If the codebase already uses one, match it.

---

## Records & immutability

Default to immutable data. Records generate value equality, `ToString`, deconstruction, and `with`-expression copying.

```csharp
// reference-type record for entities/DTOs; traditional init properties (not a primary ctor)
public sealed record Person
{
    public required string FirstName { get; init; }
    public required string LastName { get; init; }
    public int Age { get; init; }
}

var p = new Person { FirstName = "Grace", LastName = "Hopper", Age = 42 };
var renamed = p with { LastName = "Murray" };   // non-destructive copy

// small value type: readonly record struct → no heap allocation, value semantics
public readonly record struct Temperature
{
    public double Celsius { get; init; }
    public double Fahrenheit => Celsius * 9.0 / 5.0 + 32.0;
}
```

Guidance:
- `record class` for data that's large or needs inheritance; `readonly record struct` for small (≤~16 byte) values.
- `required` forces initialization at construction without a constructor parameter — pairs naturally with object initializers.
- `init` makes a property set-once: assignable in an initializer, immutable afterward.
- **Don't** make EF Core entities records — change tracking relies on reference identity, and value equality fights it.

Sources: [Records](https://learn.microsoft.com/en-us/dotnet/csharp/fundamentals/types/records) · [struct types](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/builtin-types/struct)

---

## Pattern matching

Replace cast-and-check ladders with `is` patterns and `switch` expressions.

```csharp
// declaration + property + relational + logical patterns
decimal Discount(Customer c) => c switch
{
    { Tier: Tier.Gold, YearsActive: >= 5 } => 0.25m,
    { Tier: Tier.Gold } => 0.15m,
    { OrderCount: > 100 and < 1000 } => 0.10m,
    not null => 0.0m,
    null => throw new ArgumentNullException(nameof(c)),
};

// list patterns (C# 11+)
string Describe(int[] xs) => xs switch
{
    [] => "empty",
    [var only] => $"one: {only}",
    [var first, .., var last] => $"{first}…{last}",
};

// type-test with binding, in a condition
if (shape is Circle { Radius: > 0 } circle)
    return Math.PI * circle.Radius * circle.Radius;
```

Prefer `obj is T x` over `obj is T` followed by a cast. Use `and`/`or`/`not` to combine; use property patterns to reach into nested members without temporaries.

Sources: [Pattern matching](https://learn.microsoft.com/en-us/dotnet/csharp/fundamentals/functional/pattern-matching) · [Patterns reference](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/operators/patterns)

---

## File-scoped namespaces & global usings

```csharp
// GlobalUsings.cs — project-wide usings in one place
global using System.Collections.Generic;
global using System.Threading;
global using System.Threading.Tasks;
```

```csharp
// every other file: file-scoped namespace removes a level of nesting
namespace Acme.Ordering;

public sealed class OrderService
{
    // ...
}
```

- File-scoped `namespace Foo;` (C# 10+) is the default for new code — one statement, no brace block, less indentation.
- Enable `<ImplicitUsings>enable</ImplicitUsings>` for the common `System.*` set, then add project-specific ones in a single `GlobalUsings.cs`.
- Keep `using` directives that are file-specific inside the file, after the namespace declaration.

Sources: [Namespaces](https://learn.microsoft.com/en-us/dotnet/csharp/fundamentals/program-structure/namespaces)
