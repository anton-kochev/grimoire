---
name: grimoire.dotnet-web-api
description: "Microsoft's official best practices for building RESTful and HTTP APIs with ASP.NET Core on modern .NET (current: .NET 10 LTS). Use when creating or reviewing web APIs in C#/.NET — minimal APIs vs controllers, routing, model binding, validation, ProblemDetails error handling, OpenAPI docs, API versioning, async/performance rules, EF Core data access, DTOs, authentication, CORS, rate limiting, output caching. Triggers: web api, REST API, ASP.NET Core, minimal api, controller, endpoint, IExceptionHandler, ProblemDetails, OpenAPI, TypedResults, API versioning."
---

# ASP.NET Core Web APIs

Microsoft's current guidance for building RESTful and HTTP APIs with ASP.NET Core. Examples target **.NET 10** (current LTS, released Nov 2025) and note where behavior differs by version. The web server is Kestrel; all I/O is asynchronous.

This skill provides guidance, not enforcement. Always check the project's existing patterns and `TargetFramework` first, and match them.

## Version baseline (this changes fast)

| Area | Current state (.NET 10) |
|---|---|
| Recommended style for new APIs | **Minimal APIs** (controllers remain fully supported) |
| OpenAPI generation | Built-in `Microsoft.AspNetCore.OpenApi`; **Swashbuckle/Swagger UI dropped from templates in .NET 9** |
| OpenAPI version emitted | 3.1 by default (was 3.0 in .NET 9) |
| Minimal API validation | Built-in via `AddValidation()` + DataAnnotations (**new in .NET 10**) |
| Error format | `ProblemDetails` (RFC 9457, supersedes 7807) |
| Cookie auth on API endpoints | Returns **401/403 instead of redirecting** to login (changed in .NET 10) |

When the project targets .NET 8/9, adjust: no built-in minimal-API validation, OpenAPI 3.0, and templates may still reference Swashbuckle.

## Choosing the API style

Microsoft recommends **Minimal APIs as the default for new API projects** — less ceremony, faster startup, better Native AOT story. Controllers (MVC) remain the choice for large/established codebases and a few extensibility points.

| Use **Minimal APIs** when | Use **Controllers** when |
|---|---|
| New project / greenfield API | Large existing MVC codebase to stay consistent with |
| Microservices, serverless, AOT, fast cold start | You need custom model binding (`IModelBinder`, `IModelBinderProvider`) |
| You want endpoints as composable functions | You rely on action filters, `IActionResult` conventions, or `[ApiController]` behaviors heavily |
| Small-to-medium surface area | Very large surface where folder/class structure aids navigation |

They coexist in one app — you can add minimal API endpoints to an MVC project and vice versa.

→ Deep dive: **[reference/minimal-apis.md](reference/minimal-apis.md)** and **[reference/controllers.md](reference/controllers.md)**

## Minimal API essentials

Group related endpoints with `MapGroup`, return `TypedResults` (strongly typed → better OpenAPI + unit testing), and keep `Program.cs` thin by moving endpoints into extension-method modules.

```csharp
var builder = WebApplication.CreateBuilder(args);
builder.Services.AddOpenApi();
builder.Services.AddValidation();            // .NET 10: validates DataAnnotations on handler params
builder.Services.AddProblemDetails();
builder.Services.AddScoped<IProductService, ProductService>();

var app = builder.Build();
app.MapOpenApi();                            // serves /openapi/v1.json
app.UseExceptionHandler();
app.MapProductEndpoints();
app.Run();

// ProductEndpoints.cs — endpoints live in their own module, not in Program.cs
public static class ProductEndpoints
{
    public static RouteGroupBuilder MapProductEndpoints(this IEndpointRouteBuilder routes)
    {
        var group = routes.MapGroup("/api/products").WithTags("Products");

        group.MapGet("/", async (IProductService svc, CancellationToken ct) =>
            TypedResults.Ok(await svc.GetAllAsync(ct)));

        group.MapGet("/{id:guid}", async Task<Results<Ok<Product>, NotFound>> (
            Guid id, IProductService svc, CancellationToken ct) =>
        {
            var product = await svc.FindAsync(id, ct);
            return product is null ? TypedResults.NotFound() : TypedResults.Ok(product);
        });

        group.MapPost("/", async Task<Results<Created<Product>, ValidationProblem>> (
            CreateProductRequest request, IProductService svc, CancellationToken ct) =>
        {
            var created = await svc.CreateAsync(request, ct);
            return TypedResults.Created($"/api/products/{created.Id}", created);
        });

        return group;
    }
}
```

Key rules: declare the `Results<...>` union return type so OpenAPI knows every status code; always accept and forward a `CancellationToken`; bind the body to a request **record (DTO)**, never an EF entity.

## Controller essentials

Derive from `ControllerBase` (not `Controller` — that adds View support you don't need) and annotate with `[ApiController]`, which enables attribute-routing requirement, automatic 400 on invalid `ModelState`, binding-source inference, and `ProblemDetails` for error codes. Use traditional constructors with `readonly` fields for DI.

```csharp
[ApiController]
[Route("api/[controller]")]
[Produces(MediaTypeNames.Application.Json)]
public class ProductsController : ControllerBase
{
    private readonly IProductService _service;

    public ProductsController(IProductService service)
    {
        _service = service;
    }

    [HttpGet("{id:guid}")]
    [ProducesResponseType<Product>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<Product>> GetById(Guid id, CancellationToken ct)
    {
        var product = await _service.FindAsync(id, ct);
        return product is null ? NotFound() : Ok(product);
    }

    [HttpPost]
    [ProducesResponseType<Product>(StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<Product>> Create(CreateProductRequest request, CancellationToken ct)
    {
        var created = await _service.CreateAsync(request, ct);
        return CreatedAtAction(nameof(GetById), new { id = created.Id }, created);
    }
}
```

With `[ApiController]`, the manual `if (!ModelState.IsValid) return BadRequest(ModelState);` check is redundant — it happens automatically and returns `ValidationProblemDetails`.

→ Full behavior reference: **[reference/controllers.md](reference/controllers.md)**

## RESTful design conventions

- **Resources are nouns, plural**: `/api/products`, `/api/products/{id}/reviews`. The HTTP verb is the action — never `/api/getProducts`.
- **Use the right verb**: GET (read, safe, idempotent), POST (create), PUT (full replace, idempotent), PATCH (partial update), DELETE (remove, idempotent).
- **Return the right status code** — don't return 200 for everything:

| Scenario | Status |
|---|---|
| Read / update success with body | 200 OK |
| Create success | 201 Created + `Location` header |
| Success, no body (e.g. DELETE) | 204 No Content |
| Async accepted, not yet done | 202 Accepted |
| Validation / malformed request | 400 Bad Request (`ValidationProblemDetails`) |
| Unauthenticated | 401 Unauthorized |
| Authenticated but forbidden | 403 Forbidden |
| Resource not found | 404 Not Found |
| Conflict (version, duplicate) | 409 Conflict |
| Unsupported `Content-Type` | 415 Unsupported Media Type |
| Unhandled server error | 500 (via global handler → `ProblemDetails`) |

- **Paginate collections** — never return an unbounded list. Accept `page`/`pageSize` (or cursor) and return a paged envelope with total count.
- **Version from day one** (see below) and keep responses backward compatible within a version.

## Error handling — ProblemDetails + global handler

Standardize every error as RFC 9457 `ProblemDetails`. Register `AddProblemDetails()`, implement `IExceptionHandler` per exception category, and wire `UseExceptionHandler()`. **Never leak exception messages or stack traces to clients in production.**

```csharp
builder.Services.AddProblemDetails();
builder.Services.AddExceptionHandler<NotFoundExceptionHandler>();   // runs first
builder.Services.AddExceptionHandler<GlobalExceptionHandler>();     // catch-all, last
// ...
app.UseExceptionHandler();

public sealed class GlobalExceptionHandler : IExceptionHandler
{
    private readonly IProblemDetailsService _problemDetails;
    private readonly ILogger<GlobalExceptionHandler> _logger;

    public GlobalExceptionHandler(IProblemDetailsService problemDetails,
                                  ILogger<GlobalExceptionHandler> logger)
    {
        _problemDetails = problemDetails;
        _logger = logger;
    }

    public async ValueTask<bool> TryHandleAsync(
        HttpContext context, Exception exception, CancellationToken ct)
    {
        _logger.LogError(exception, "Unhandled exception");
        context.Response.StatusCode = StatusCodes.Status500InternalServerError;
        return await _problemDetails.TryWriteAsync(new ProblemDetailsContext
        {
            HttpContext = context,
            ProblemDetails = { Title = "An unexpected error occurred.", Status = 500 }
        });
    }
}
```

Handlers run in registration order; the first to return `true` wins. Pick **one** write path per handler — either set the response directly or call the ProblemDetails service, never both.

→ Patterns, validation problems, custom extensions: **[reference/error-handling.md](reference/error-handling.md)**

## Validation

- **Minimal APIs (.NET 10):** `builder.Services.AddValidation();` auto-generates validators from DataAnnotations (`[Required]`, `[Range]`, `[EmailAddress]`, …) on handler parameter types; failures return `ValidationProblem`.
- **Controllers:** `[ApiController]` validates `ModelState` automatically → 400 `ValidationProblemDetails`.
- **Complex/cross-field rules:** add FluentValidation and invoke it in an endpoint filter (minimal) or action filter (controllers). Don't put business validation in the model.
- Validate at the boundary on **request DTOs**, not domain entities.

## OpenAPI documentation

Use the built-in package — not Swashbuckle — for new projects:

```csharp
builder.Services.AddOpenApi();   // Microsoft.AspNetCore.OpenApi
app.MapOpenApi();                // GET /openapi/v1.json  (OpenAPI 3.1 on .NET 10)
```

For an interactive UI, add **Scalar** (`Scalar.AspNetCore`, `app.MapScalarApiReference()`) — Swagger UI is no longer shipped by default. Enrich the document with `.WithName()`, `.WithTags()`, `.WithSummary()`, `TypedResults`, and `[ProducesResponseType]` so the schema is accurate.

## API versioning

Use `Asp.Versioning.*` (v10.x is purpose-built for .NET 10 and the new OpenAPI). Install `Asp.Versioning.Http` (minimal APIs) or `Asp.Versioning.Mvc` (controllers), then version via URL segment (`/api/v1/...`), query string, or header.

```csharp
builder.Services.AddApiVersioning(options =>
{
    options.DefaultApiVersion = new ApiVersion(1.0);
    options.AssumeDefaultVersionWhenUnspecified = true;
    options.ReportApiVersions = true;     // adds api-supported-versions header
});
```

→ Full setup for both styles + OpenAPI integration: **[reference/openapi-versioning-security.md](reference/openapi-versioning-security.md)**

## Async & performance — the cardinal rules

These are the highest-impact items from Microsoft's best-practices guide. Most production API problems trace back to violating one of them.

| Do | Don't |
|---|---|
| Make the whole call stack `async`; `await` all I/O | Block with `.Result`, `.Wait()`, or `Task.GetAwaiter().GetResult()` (causes thread-pool starvation) |
| Accept `CancellationToken` and pass it down | Use `async void` in handlers/actions — **ever** |
| Pool HTTP calls with `IHttpClientFactory` | `new HttpClient()` per request (socket exhaustion) |
| Paginate; stream large sets with `IAsyncEnumerable<T>` | Return huge unbounded collections (LOH pressure, slow GC) |
| Cache hot, slow-changing data (Memory/Distributed/Output) | Use `Task.Run` to "make" sync code async |
| Read/deserialize the body async (`System.Text.Json` from stream) | Buffer large bodies into a single `byte[]`/`string` |

Never store `HttpContext` (or anything resolved from it) in a field, share it across threads, or touch it after the response completes. For background work, copy the data you need and resolve scoped services via `IServiceScopeFactory.CreateAsyncScope()`.

→ Full do/don't catalog with code: **[reference/performance-and-reliability.md](reference/performance-and-reliability.md)**

## Data access (EF Core)

- All queries `async` (`ToListAsync`, `FirstOrDefaultAsync`) with a `CancellationToken`.
- `AsNoTracking()` for read-only queries.
- Filter, project, and aggregate **in the database** (`Where`/`Select`/`Sum`) — don't pull rows to filter in memory; watch for N+1.
- Project straight to a DTO with `Select` so you fetch only needed columns.
- Don't capture a scoped `DbContext` on a background thread — create a new scope.

## Security

- `app.UseHttpsRedirection();` and HSTS in production; never disable TLS validation.
- AuthN/AuthZ: `AddAuthentication().AddJwtBearer(...)`, `AddAuthorization()`; protect groups with `.RequireAuthorization()` / `[Authorize]`. On .NET 10, API endpoints return 401/403 rather than redirecting.
- **CORS**: define a named policy with explicit origins — never `AllowAnyOrigin()` together with credentials.
- **Rate limiting**: built-in middleware (`AddRateLimiter` + `UseRateLimiter`, .NET 7+) — fixed/sliding window, token bucket, concurrency.
- Don't trust `HttpRequest.ContentLength` (it's null when the header is absent — comparisons against null silently return false).
- Return `ProblemDetails` for auth failures too; don't echo back why auth failed in detail.

## DTOs & serialization

- **Never expose EF entities directly** — map to request/response DTOs (`record` types are ideal: immutable, value equality, concise).
- `System.Text.Json` is the default (async, UTF-8 optimized, faster than Newtonsoft). Configure with `JsonSerializerOptions`; use the **source generator** (`JsonSerializerContext`) for AOT and lower allocations.
- Keep DTOs flat and intentional; don't leak internal/audit fields. Map with hand-written mappers or a library — but keep the mapping explicit.

## Anti-patterns

| Anti-pattern | Do instead |
|---|---|
| Returning EF entities from endpoints | Map to DTOs (`record`) |
| `async void`, `.Result`, `.Wait()` | `async Task` end to end, `await` |
| `new HttpClient()` everywhere | `IHttpClientFactory` |
| `catch (Exception)` in every action | One global `IExceptionHandler` → `ProblemDetails` |
| Returning 200 + `{ "error": ... }` | Correct status code + `ProblemDetails` |
| Business logic in controllers/handlers | Thin endpoints; logic in services |
| Unbounded list endpoints | Pagination / `IAsyncEnumerable<T>` |
| Verbs in routes (`/getUser`) | Nouns + HTTP method (`GET /users/{id}`) |
| Manual Swagger wiring on .NET 9/10 | `AddOpenApi()` + Scalar |
| `[FromRoute]` for values containing `%2f` | `[FromQuery]` (slashes aren't unescaped in route values) |

## Authoritative sources

- ASP.NET Core best practices: https://learn.microsoft.com/aspnet/core/fundamentals/best-practices
- Create web APIs: https://learn.microsoft.com/aspnet/core/web-api/
- Minimal APIs overview: https://learn.microsoft.com/aspnet/core/fundamentals/minimal-apis/overview
- Handle errors / ProblemDetails: https://learn.microsoft.com/aspnet/core/fundamentals/error-handling
- Generate OpenAPI documents: https://learn.microsoft.com/aspnet/core/fundamentals/openapi/aspnetcore-openapi
- API versioning (`dotnet/aspnet-api-versioning`): https://github.com/dotnet/aspnet-api-versioning
- Rate limiting middleware: https://learn.microsoft.com/aspnet/core/performance/rate-limit
- What's new in ASP.NET Core for .NET 10: https://learn.microsoft.com/aspnet/core/release-notes/aspnetcore-10.0

## Deep reference

- **[reference/minimal-apis.md](reference/minimal-apis.md)** — route groups, `TypedResults`, parameter binding, endpoint filters, validation, project organization, full app example
- **[reference/controllers.md](reference/controllers.md)** — `[ApiController]` behaviors, binding-source inference, action return types, content negotiation
- **[reference/error-handling.md](reference/error-handling.md)** — `IExceptionHandler`, ProblemDetails customization, validation problems, exception-to-status mapping
- **[reference/performance-and-reliability.md](reference/performance-and-reliability.md)** — async pitfalls, `HttpContext` rules, `HttpClientFactory`, caching, pagination, background work
- **[reference/openapi-versioning-security.md](reference/openapi-versioning-security.md)** — OpenAPI + Scalar, `Asp.Versioning` for both styles, JWT auth, CORS, rate limiting, output caching
