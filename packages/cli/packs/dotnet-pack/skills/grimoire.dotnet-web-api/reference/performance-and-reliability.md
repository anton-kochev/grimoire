# Performance & Reliability (ASP.NET Core, .NET 10)

The highest-impact correctness and scale rules from Microsoft's best-practices guide. Most production API incidents trace back to violating one of these.

## Table of Contents

- [Async all the way](#async-all-the-way)
- [HttpContext rules](#httpcontext-rules)
- [Background work](#background-work)
- [HttpClientFactory](#httpclientfactory)
- [Pagination and streaming](#pagination-and-streaming)
- [Caching](#caching)
- [Large request/response bodies](#large-requestresponse-bodies)
- [EF Core data access](#ef-core-data-access)

## Async all the way

Async lets a small thread pool serve thousands of concurrent requests. Blocking a request thread on async work causes **thread-pool starvation** — latency spikes and the server appearing to hang under load.

```csharp
// DON'T — blocks the request thread
var data = _service.GetAsync(id).Result;          // also .Wait(), .GetAwaiter().GetResult()

// DO — await the whole chain
var data = await _service.GetAsync(id, ct);
```

Rules:

- Make controller actions / route handlers `async Task<...>` and `await` every I/O call.
- **Never use `async void`** in request handling — the request completes at the first `await`, and later access crashes the process.
- Don't `Task.Run` to make sync code "async" — ASP.NET Core already runs handlers on the thread pool; it just adds scheduling overhead.
- Don't `await Task.Run(...)` immediately, and don't take locks on hot paths.
- Flow a `CancellationToken` from the handler through to data/HTTP calls so abandoned requests stop work early.

## HttpContext rules

`HttpContext` is request-scoped and **not thread-safe**. It's recycled when the response completes.

- **Don't store `HttpContext`** (or `HttpContext.User`, request path, etc.) in a field/singleton. If you need it, inject `IHttpContextAccessor` and read `.HttpContext` at point of use (null-checked).
- **Don't access it from multiple threads** in parallel — copy the values you need into locals first.
- **Don't use it after the request completes** — capture needed data before starting fire-and-forget work.

```csharp
// DON'T — captures HttpContext on a background thread
[HttpGet("/report")]
public IActionResult Bad()
{
    _ = Task.Run(async () => { await Task.Delay(1000); Log(HttpContext.Request.Path); });
    return Accepted();
}

// DO — copy data out first, capture nothing from the controller
[HttpGet("/report")]
public IActionResult Good()
{
    string path = HttpContext.Request.Path;
    _ = Task.Run(async () => { await Task.Delay(1000); Log(path); });
    return Accepted();
}
```

## Background work

Don't do long-running work inside the request. Offload it. And never capture scoped services (like `DbContext`) on a background thread — they're disposed when the request ends (`ObjectDisposedException`). Create a fresh scope:

```csharp
public class ReportController : ControllerBase
{
    private readonly IServiceScopeFactory _scopeFactory;   // singleton — safe to capture

    public ReportController(IServiceScopeFactory scopeFactory)
    {
        _scopeFactory = scopeFactory;
    }

    [HttpPost("/reports")]
    public IActionResult Enqueue(ReportRequest request)
    {
        _ = Task.Run(async () =>
        {
            await using var scope = _scopeFactory.CreateAsyncScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
            // ... use db in this scope
            await db.SaveChangesAsync();
        });
        return Accepted();
    }
}
```

Prefer a proper queue: an `IHostedService`/`BackgroundService` with a channel, or an out-of-process worker fed by a message broker (Azure Service Bus, RabbitMQ). Use SignalR to notify clients when async work finishes.

## HttpClientFactory

`HttpClient` is meant to be reused; `new HttpClient()` per call leaks sockets (`TIME_WAIT`) and can exhaust ports. Use `IHttpClientFactory`, ideally as a typed client, and layer resilience with `Microsoft.Extensions.Http.Resilience` (Polly).

```csharp
builder.Services.AddHttpClient<ICatalogClient, CatalogClient>(client =>
{
    client.BaseAddress = new Uri("https://catalog.internal/");
    client.Timeout = TimeSpan.FromSeconds(10);
})
.AddStandardResilienceHandler();   // retries, circuit breaker, timeout

public sealed class CatalogClient : ICatalogClient
{
    private readonly HttpClient _http;

    public CatalogClient(HttpClient http)
    {
        _http = http;
    }

    public async Task<Product?> GetAsync(Guid id, CancellationToken ct) =>
        await _http.GetFromJsonAsync<Product>($"products/{id}", ct);
}
```

## Pagination and streaming

Never return an unbounded collection — it risks `OutOfMemoryException`, large-object-heap pressure, and slow responses.

```csharp
public record PagedResult<T>(IReadOnlyList<T> Items, int Page, int PageSize, int TotalCount)
{
    public int TotalPages => (int)Math.Ceiling(TotalCount / (double)PageSize);
}

public async Task<PagedResult<Product>> SearchAsync(int page, int pageSize, CancellationToken ct)
{
    page = Math.Max(1, page);
    pageSize = Math.Clamp(pageSize, 1, 100);            // cap the page size

    var query = _db.Products.AsNoTracking().OrderBy(p => p.Name);
    var total = await query.CountAsync(ct);
    var items = await query.Skip((page - 1) * pageSize).Take(pageSize)
        .Select(p => new Product(p.Id, p.Name, p.Price))   // project to DTO in the DB
        .ToListAsync(ct);

    return new PagedResult<Product>(items, page, pageSize, total);
}
```

For large exports, stream with `IAsyncEnumerable<T>` so the serializer iterates asynchronously instead of buffering. Returning a synchronous `IEnumerable<T>` forces sync enumeration during serialization — call `ToListAsync()` first or return `IAsyncEnumerable<T>`. Cursor/keyset pagination beats `Skip/Take` for deep pages.

## Caching

- **Output caching** (`AddOutputCache` + `UseOutputCache`, .NET 7+) — caches the full response; tag and invalidate by policy. Best for read-heavy GETs.
- **`IMemoryCache`** — per-instance, for hot data when slightly stale is acceptable.
- **`IDistributedCache`** (Redis/SQL) — shared across instances; required behind a load balancer for shared state.
- **Response caching** — honors HTTP cache headers for clients/proxies.

```csharp
builder.Services.AddOutputCache(options =>
    options.AddBasePolicy(b => b.Expire(TimeSpan.FromSeconds(30))));
app.UseOutputCache();

group.MapGet("/popular", GetPopular).CacheOutput();
```

## Large request/response bodies

Any allocation ≥ 85,000 bytes lands on the large object heap and forces expensive Gen2 collections.

- Deserialize directly from the request stream async — don't read into a `string`/`byte[]` first: `await JsonSerializer.DeserializeAsync<T>(Request.Body, options, ct)` or model binding.
- Read forms with `await Request.ReadFormAsync(ct)`, not `Request.Form` (sync-over-async).
- Cap upload sizes; stream large files to disk/blob rather than buffering.
- Pool large buffers with `ArrayPool<T>` on hot paths.
- `System.Text.Json` reads/writes async and is UTF-8 optimized — prefer it over Newtonsoft.

## EF Core data access

- All queries `async` with a `CancellationToken` (`ToListAsync`, `FirstOrDefaultAsync`, `AnyAsync`).
- `AsNoTracking()` for read-only queries — less memory, faster.
- Filter/aggregate **in the database** (`Where`, `Select`, `Sum`); make sure expressions translate to SQL (avoid forcing client evaluation).
- Watch for **N+1** — use `Include`/projection deliberately; don't project queries over navigation collections naively.
- Don't fetch entities to map then discard columns — `Select` straight into the DTO.
- For very hot paths consider `DbContext` pooling and compiled queries, but measure first — the added complexity often isn't worth it.
