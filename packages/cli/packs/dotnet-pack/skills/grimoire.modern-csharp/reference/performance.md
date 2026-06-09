# Performance

Cutting allocations and CPU on hot paths. Targets .NET 8/9/10. **Measure before and after** — most code is not hot, and these techniques trade readability for speed.

## Contents

- [Span, Memory, stackalloc](#span-memory-stackalloc)
- [ArrayPool & pooling](#arraypool--pooling)
- [Struct vs class & boxing](#struct-vs-class--boxing)
- [Strings](#strings)
- [Collection expressions & frozen collections](#collection-expressions--frozen-collections)
- [SearchValues](#searchvalues)
- [SIMD / vectorization](#simd--vectorization)
- [BenchmarkDotNet](#benchmarkdotnet)

---

## Span, Memory, stackalloc

`Span<T>`/`ReadOnlySpan<T>` are stack-only views over contiguous memory (arrays, strings, `stackalloc` buffers, native memory). Slicing creates a view — **no copy**.

```csharp
// parse without allocating substrings
static (ReadOnlySpan<char> key, ReadOnlySpan<char> val) SplitPair(ReadOnlySpan<char> line)
{
    int eq = line.IndexOf('=');
    return (line[..eq], line[(eq + 1)..]);
}

// small temporary buffer on the stack — no heap allocation, no GC
Span<byte> buffer = stackalloc byte[256];
int written = Encoding.UTF8.GetBytes(text, buffer);
```

- `Span<T>` is a `ref struct`: it can't be a field of a class, boxed, captured in a lambda, or used across an `await`. Use it for synchronous, local, hot-path work.
- `Memory<T>`/`ReadOnlyMemory<T>` lift that restriction — they can be stored on the heap and passed to async methods. Convert with `.Span` when you need to operate.
- `stackalloc` only for small buffers (keep under ~1 KB) and bounded sizes — a `stackalloc` in a loop or with attacker-controlled size risks stack overflow.

Sources: [Memory and spans](https://learn.microsoft.com/en-us/dotnet/standard/memory-and-spans/) · [Memory<T>/Span<T> usage guidelines](https://learn.microsoft.com/en-us/dotnet/standard/memory-and-spans/memory-t-usage-guidelines)

---

## ArrayPool & pooling

When you need a larger or longer-lived buffer than `stackalloc` allows, rent it instead of `new`-ing one each call. Reduces GC pressure on high-frequency paths.

```csharp
byte[] buffer = ArrayPool<byte>.Shared.Rent(length);
try
{
    var span = buffer.AsSpan(0, length);   // rented array may be LARGER than requested
    FillAndProcess(span);
}
finally
{
    ArrayPool<byte>.Shared.Return(buffer); // always return, even on exception
}
```

- The rented array is **at least** `length`; never assume `buffer.Length == length` — track the size yourself.
- Always `Return` in a `finally`. Pass `clearArray: true` when the buffer held sensitive data.
- For object pooling (not just arrays), use `Microsoft.Extensions.ObjectPool` — good for expensive-to-construct, reusable objects like `StringBuilder`.

Source: [ArrayPool<T>](https://learn.microsoft.com/en-us/dotnet/api/system.buffers.arraypool-1)

---

## Struct vs class & boxing

```csharp
public readonly struct Point     // small, immutable, atomic → struct
{
    public int X { get; }
    public int Y { get; }
    public Point(int x, int y) { X = x; Y = y; }   // traditional constructor
}
```

Choose `struct` only when **all** hold: the value is small (≤~16 bytes), logically a single value, immutable, and not frequently boxed. Otherwise use `class`.

- **Value semantics**: structs copy on assignment and when passed by value — large structs make copying expensive. Pass big readonly structs by `in` to avoid the copy.
- **Make structs `readonly`** so the compiler doesn't make defensive copies on member access.
- **Avoid boxing**: assigning a struct to `object`, an interface, or a non-constrained generic allocates and copies. Constrain generics with `where T : struct`, and prefer generic APIs over `object`-typed ones.
- A large **mutable** struct in a `List<T>` is a trap — indexing returns a *copy*, so mutations silently no-op.

Sources: [Choosing between class and struct](https://learn.microsoft.com/en-us/dotnet/standard/design-guidelines/choosing-between-class-and-struct)

---

## Strings

Strings are immutable; naive concatenation in a loop allocates O(n²).

```csharp
// loop building → StringBuilder
var sb = new StringBuilder();
foreach (var item in items) sb.Append(item).Append(',');

// joining a sequence → string.Join (single allocation)
string csv = string.Join(',', items);

// known final length, fill in place → string.Create (one allocation, no intermediates)
string masked = string.Create(card.Length, card, static (span, src) =>
{
    src.AsSpan(0, src.Length - 4).CopyTo(span);
    span[..^4].Fill('*');
    src.AsSpan(^4).CopyTo(span[^4..]);
});
```

- A single `$"{a}-{b}"` interpolation is fine and is optimized. The cost is interpolating **inside a loop** or **into a log message** — for logging, pass values as parameters (see compile-time logging).
- `StringBuilder.Append($"...")` in .NET 6+ appends interpolation parts directly without an intermediate string.
- Compare with `StringComparison.Ordinal` for non-linguistic comparisons (faster and culture-safe); use `string.Equals(a, b, StringComparison.OrdinalIgnoreCase)` rather than `ToLower()`-then-compare.

Source: [String interpolation in C# 10 / .NET 6](https://devblogs.microsoft.com/dotnet/string-interpolation-in-c-10-and-net-6/)

---

## Collection expressions & frozen collections

```csharp
// collection expressions (C# 12+): one syntax for arrays, lists, spans
int[] a = [1, 2, 3];
List<int> b = [..a, 4, 5];                 // spread
ReadOnlySpan<char> s = ['x', 'y', 'z'];

// frozen: build once, read forever — fastest lookups of any BCL collection
private static readonly FrozenDictionary<string, int> StatusCodes =
    new Dictionary<string, int> { ["OK"] = 200, ["NotFound"] = 404 }
        .ToFrozenDictionary();

private static readonly FrozenSet<string> Stopwords =
    FrozenSet.ToFrozenSet(["a", "the", "and"], StringComparer.OrdinalIgnoreCase);
```

- `FrozenDictionary`/`FrozenSet` (`System.Collections.Frozen`, .NET 8+) cost more to build but have the fastest reads — ideal for static lookup tables initialized at startup and never mutated.
- For mutable dictionaries on hot paths, `CollectionsMarshal.GetValueRefOrAddDefault` does a single lookup for get-or-add instead of two.
- Prefer the collection-expression `[...]` form for literals; the compiler picks an efficient construction (and can target `Span` with no allocation).

Sources: [FrozenDictionary](https://learn.microsoft.com/en-us/dotnet/api/system.collections.frozen.frozendictionary-2) · [Read-only, frozen, immutable collections](https://devblogs.microsoft.com/premier-developer/read-only-frozen-and-immutable-collections/)

---

## SearchValues

`SearchValues<T>` (.NET 8+) precomputes an optimized, SIMD-accelerated representation of a set to search for. Create once as `static readonly`; reuse for every search.

```csharp
private static readonly SearchValues<char> Whitespace = SearchValues.Create(" \t\r\n");

static ReadOnlySpan<char> TrimAscii(ReadOnlySpan<char> s)
{
    int start = s.IndexOfAnyExcept(Whitespace);
    if (start < 0) return default;
    int end = s.LastIndexOfAnyExcept(Whitespace);
    return s[start..(end + 1)];
}
```

Far faster than repeated `IndexOfAny(char[])` or per-char checks. .NET 9 adds substring `SearchValues<string>`.

Source: [SearchValues<T>](https://learn.microsoft.com/en-us/dotnet/api/system.buffers.searchvalues-1)

---

## SIMD / vectorization

You rarely need explicit SIMD — the JIT auto-vectorizes many loops and the BCL (`Span` ops, `SearchValues`, LINQ in .NET 9) is already vectorized.

- .NET 8 added AVX-512; .NET 9 widened vectorization across the BCL and improved Arm64 (SVE).
- Reach for `Vector<T>` / `Vector128/256/512<T>` and hardware intrinsics only for measured, compute-bound kernels (image/audio/math). Keep a scalar fallback for unsupported hardware (`Vector.IsHardwareAccelerated`).

Sources: [SIMD-accelerated types](https://learn.microsoft.com/en-us/dotnet/standard/simd) · [Perf improvements in .NET 9](https://devblogs.microsoft.com/dotnet/performance-improvements-in-net-9/)

---

## BenchmarkDotNet

Don't guess — measure. BenchmarkDotNet handles warmup, statistics, and allocation tracking.

```csharp
[MemoryDiagnoser]                      // reports allocations + GC counts
public class JoinBenchmarks
{
    private string[] _items = null!;

    [GlobalSetup]
    public void Setup() => _items = Enumerable.Range(0, 1000).Select(i => $"i{i}").ToArray();

    [Benchmark(Baseline = true)]
    public string Concat()
    {
        var r = "";
        foreach (var s in _items) r += s;   // O(n²)
        return r;
    }

    [Benchmark]
    public string Join() => string.Join("", _items);
}

// Program.cs:  BenchmarkRunner.Run<JoinBenchmarks>();
```

- Always run benchmarks in **Release** (`dotnet run -c Release`) — Debug disables JIT optimizations.
- `[MemoryDiagnoser]` is the most useful attribute here — allocation count usually predicts hot-path cost better than raw time.
- Benchmark on an idle machine; let warmup iterations JIT before measuring; mark a `[Benchmark(Baseline = true)]` to get relative ratios.

Sources: [BenchmarkDotNet](https://github.com/dotnet/BenchmarkDotNet) · [Good practices](https://benchmarkdotnet.org/articles/guides/good-practices.html)
