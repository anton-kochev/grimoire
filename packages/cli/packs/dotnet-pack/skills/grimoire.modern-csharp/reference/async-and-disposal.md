# Async/await & deterministic disposal

Correct asynchronous C# and reliable resource cleanup. Targets .NET 8/9/10.

## Contents

- [Cancellation tokens](#cancellation-tokens)
- [ConfigureAwait](#configureawait)
- [ValueTask](#valuetask)
- [Never `async void`; never block](#never-async-void-never-block)
- [Coordinating tasks](#coordinating-tasks)
- [IAsyncEnumerable streams](#iasyncenumerable-streams)
- [IDisposable & IAsyncDisposable](#idisposable--iasyncdisposable)

---

## Cancellation tokens

Every async method that does real I/O should accept a `CancellationToken` and pass it down the chain. This is how a request that's abandoned (timeout, client disconnect, app shutdown) stops doing work.

```csharp
public async Task<Data> FetchAsync(int id, CancellationToken ct = default)
{
    using var resp = await _http.GetAsync($"data/{id}", ct).ConfigureAwait(false);
    resp.EnsureSuccessStatusCode();
    return (await resp.Content.ReadFromJsonAsync<Data>(ct).ConfigureAwait(false))!;
}
```

- Default the parameter (`CancellationToken ct = default`) so callers that don't care needn't pass one.
- Pass the token to **every** awaited call that accepts one — a token you don't forward does nothing.
- For your own loops, check `ct.ThrowIfCancellationRequested()` between work units.
- Compose deadlines with `CancellationTokenSource.CreateLinkedTokenSource(...)` and time-box with `new CancellationTokenSource(TimeSpan.FromSeconds(30))`.

Source: [Cancel async tasks](https://learn.microsoft.com/en-us/dotnet/csharp/asynchronous-programming/cancel-async-tasks-after-a-period-of-time)

---

## ConfigureAwait

`ConfigureAwait(false)` tells the runtime not to resume on the captured synchronization context.

- **Library code**: use `ConfigureAwait(false)` on every await. Reusable code shouldn't depend on, or pay for, the caller's context, and it avoids deadlocks when a caller blocks.
- **Application code** (ASP.NET Core has no sync context; UI apps do): omit it where you need the context back (e.g. to touch UI controls after the await). In ASP.NET Core it's a no-op, so don't bother.
- .NET 8+ adds `ConfigureAwait(ConfigureAwaitOptions.SuppressThrowing)` and `.ForceYielding` for finer control.

Source: [ConfigureAwait FAQ](https://devblogs.microsoft.com/dotnet/configureawait-faq/)

---

## ValueTask

`Task<T>` is the default. `ValueTask<T>` avoids a `Task` allocation when a method **usually completes synchronously** (e.g. a cache hit), but it comes with sharp edges.

```csharp
public ValueTask<Data> GetAsync(string key)
{
    if (_cache.TryGetValue(key, out var hit))
        return new ValueTask<Data>(hit);      // no allocation on the hot path
    return new ValueTask<Data>(LoadAndCacheAsync(key));
}
```

Rules for `ValueTask`:
- **Await it exactly once.** Never await twice, never `.Result` it before completion, never store it for later.
- If you need any of those, call `.AsTask()` and work with that.
- Only adopt it after profiling shows the allocation matters — `Task` is simpler and almost always fine.

Source: [Understanding the Whys, Whats, and Whens of ValueTask](https://devblogs.microsoft.com/dotnet/understanding-the-whys-whats-and-whens-of-valuetask/)

---

## Never `async void`; never block

```csharp
public async void Handler() { }   // ✗ can't be awaited; exceptions crash the process
public async Task HandleAsync() { }  // ✓

var data = FetchAsync(id).Result;            // ✗ deadlock risk, wraps exceptions
var data = FetchAsync(id).GetAwaiter().GetResult();  // ✗ same
var data = await FetchAsync(id);             // ✓
```

- `async void` is only acceptable for UI event handlers (where the signature is forced). Everywhere else return `Task`/`ValueTask` so the caller can await and observe exceptions.
- Don't block on async with `.Result`/`.Wait()`/`.GetAwaiter().GetResult()` — it ties up a thread and can deadlock when a context is captured. Make the call chain async all the way up.

---

## Coordinating tasks

```csharp
// run independent work concurrently, then await all
var results = await Task.WhenAll(ids.Select(id => FetchAsync(id, ct)));

// first to finish wins (e.g. primary vs fallback)
var winner = await Task.WhenAny(primary, fallback);

// .NET 9+: await an IAsyncEnumerable of tasks as each completes
await foreach (var done in Task.WhenEach(tasks).WithCancellation(ct))
    Process(await done);
```

`Task.WhenAll` surfaces the first exception (and aggregates the rest in the returned task's `Exception`). Prefer it over sequential awaits when the operations are independent.

---

## IAsyncEnumerable streams

Stream results as they arrive instead of buffering everything. Mark the token parameter with `[EnumeratorCancellation]`.

```csharp
public async IAsyncEnumerable<Record> ReadRecordsAsync(
    Stream source,
    [EnumeratorCancellation] CancellationToken ct = default)
{
    using var reader = new StreamReader(source);
    while (await reader.ReadLineAsync(ct).ConfigureAwait(false) is { } line)
    {
        if (Record.TryParse(line, out var record))
            yield return record;
    }
}

// consume
await foreach (var r in ReadRecordsAsync(stream, ct).ConfigureAwait(false))
    Handle(r);
```

Use `.WithCancellation(ct)` / `.ConfigureAwait(false)` on the `await foreach` when consuming. Name these methods with the `Async` suffix.

Source: [IAsyncEnumerable](https://learn.microsoft.com/en-us/dotnet/api/system.collections.generic.iasyncenumerable-1)

---

## IDisposable & IAsyncDisposable

Use `using` declarations (C# 8+) so resources are released at scope exit — including on exception — without an explicit block.

```csharp
public async Task ExportAsync(string path, CancellationToken ct)
{
    await using var stream = File.Create(path);          // async cleanup
    using var writer = new StreamWriter(stream);          // sync cleanup
    await writer.WriteAsync(_data);
    // writer disposed, then stream disposed-async, in reverse order at method end
}
```

Implementing the pattern:

```csharp
public sealed class Connection : IAsyncDisposable, IDisposable
{
    private readonly Socket _socket;

    public void Dispose() => _socket.Dispose();

    public async ValueTask DisposeAsync()
    {
        await _socket.DisconnectAsync().ConfigureAwait(false);
        _socket.Dispose();
        GC.SuppressFinalize(this);
    }
}
```

- Implement `IAsyncDisposable` when cleanup itself is async (flushing a network stream, committing a transaction). Implement `IDisposable` too if a sync path is also valid.
- Prefer `sealed` classes — it lets you skip the protected `Dispose(bool)`/finalizer ceremony, which is only needed when you own **unmanaged** resources or expect subclasses.
- Multiple `using` declarations dispose in reverse (LIFO) order.
- `await using` requires `IAsyncDisposable`; plain `using` requires `IDisposable`.

Sources: [using statement](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/statements/using) · [Implement DisposeAsync](https://learn.microsoft.com/en-us/dotnet/standard/garbage-collection/implementing-disposeasync)
