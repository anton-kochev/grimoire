# OpenAPI, Versioning & Security (ASP.NET Core, .NET 10)

Deep reference for documenting, versioning, and securing the API.

## Table of Contents

- [OpenAPI generation (built-in)](#openapi-generation-built-in)
- [Document customization with transformers](#document-customization-with-transformers)
- [Scalar UI](#scalar-ui)
- [API versioning](#api-versioning)
- [Authentication (JWT bearer)](#authentication-jwt-bearer)
- [Authorization](#authorization)
- [CORS](#cors)
- [Rate limiting](#rate-limiting)

## OpenAPI generation (built-in)

Since .NET 9, ASP.NET Core ships native OpenAPI generation in `Microsoft.AspNetCore.OpenApi`. **Swashbuckle/Swagger UI was removed from the templates.** On .NET 10 the emitted document is OpenAPI 3.1.

```csharp
builder.Services.AddOpenApi();   // optionally AddOpenApi("v1") for named docs
// ...
app.MapOpenApi();                // GET /openapi/v1.json
```

Drive an accurate document from code:

- `TypedResults` and `[ProducesResponseType]` declare response types/status codes.
- `.WithName`, `.WithTags`, `.WithSummary`, `.WithDescription` add operation metadata (minimal APIs).
- Request/response **DTOs** become the schemas — another reason not to expose entities.

## Document customization with transformers

Use document/operation transformers for cross-cutting doc concerns (security schemes, servers, common headers):

```csharp
builder.Services.AddOpenApi(options =>
{
    options.AddDocumentTransformer((document, context, ct) =>
    {
        document.Info = new()
        {
            Title = "Catalog API",
            Version = "v1",
            Contact = new() { Name = "Platform Team", Email = "platform@example.com" }
        };
        return Task.CompletedTask;
    });
});
```

## Scalar UI

Swagger UI no longer ships by default. **Scalar** is the common interactive replacement:

```csharp
// dotnet add package Scalar.AspNetCore
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    app.MapScalarApiReference();   // UI at /scalar/v1, reads /openapi/v1.json
}
```

You can still add Swashbuckle (`Swagger UI`) or NSwag manually if a workflow needs it, but there's no compelling reason for new projects.

## API versioning

Use `Asp.Versioning.*` (v10.x is built for .NET 10 + the new OpenAPI). Pick `Asp.Versioning.Http` for minimal APIs, `Asp.Versioning.Mvc` (+ `Asp.Versioning.Mvc.ApiExplorer`) for controllers.

```csharp
builder.Services.AddApiVersioning(options =>
{
    options.DefaultApiVersion = new ApiVersion(1.0);
    options.AssumeDefaultVersionWhenUnspecified = true;
    options.ReportApiVersions = true;                       // api-supported / api-deprecated headers
    options.ApiVersionReader = ApiVersionReader.Combine(    // accept any of these
        new UrlSegmentApiVersionReader(),
        new HeaderApiVersionReader("X-Api-Version"),
        new QueryStringApiVersionReader("api-version"));
})
.AddApiExplorer(options =>
{
    options.GroupNameFormat = "'v'VVV";                     // v1, v1.1, v2
    options.SubstituteApiVersionInUrl = true;
});
```

Minimal APIs — version a route group:

```csharp
var versionSet = app.NewApiVersionSet()
    .HasApiVersion(new ApiVersion(1.0))
    .HasApiVersion(new ApiVersion(2.0))
    .ReportApiVersions()
    .Build();

var products = app.MapGroup("/api/v{version:apiVersion}/products")
    .WithApiVersionSet(versionSet);

products.MapGet("/", GetAllV1).MapToApiVersion(1.0);
products.MapGet("/", GetAllV2).MapToApiVersion(2.0);
```

Controllers — attributes:

```csharp
[ApiController]
[ApiVersion(1.0)]
[ApiVersion(2.0)]
[Route("api/v{version:apiVersion}/[controller]")]
public class ProductsController : ControllerBase
{
    [HttpGet, MapToApiVersion(1.0)]
    public Task<ActionResult<IEnumerable<Product>>> GetV1(CancellationToken ct) => /* ... */;

    [HttpGet, MapToApiVersion(2.0)]
    public Task<ActionResult<PagedResult<Product>>> GetV2(CancellationToken ct) => /* ... */;
}
```

URL-segment versioning (`/api/v1/...`) is the most cache- and proxy-friendly. Mark retiring versions `[ApiVersion(1.0, Deprecated = true)]`.

## Authentication (JWT bearer)

```csharp
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.Authority = builder.Configuration["Auth:Authority"];
        options.Audience = builder.Configuration["Auth:Audience"];
        options.TokenValidationParameters = new()
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true
        };
    });

builder.Services.AddAuthorization();
// ...
app.UseAuthentication();
app.UseAuthorization();
```

On **.NET 10**, known API endpoints return **401/403** instead of redirecting to a login page when using cookie auth — correct behavior for APIs.

## Authorization

Define policies once; apply per endpoint, group, or controller.

```csharp
builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("AdminOnly", policy => policy.RequireRole("admin"));
    options.AddPolicy("CanEditCatalog", policy => policy.RequireClaim("scope", "catalog:write"));
});
```

```csharp
// minimal APIs
app.MapGroup("/api/admin").RequireAuthorization("AdminOnly");
products.MapPost("/", Create).RequireAuthorization("CanEditCatalog");

// controllers
[Authorize(Policy = "CanEditCatalog")]
[HttpPost]
public Task<ActionResult<Product>> Create(...) { }

// opt an endpoint out
public IActionResult Health() => Ok();   // [AllowAnonymous]
```

## CORS

Define a **named policy with explicit origins**. Never combine `AllowAnyOrigin()` with `AllowCredentials()` — it's insecure and disallowed.

```csharp
builder.Services.AddCors(options =>
{
    options.AddPolicy("spa", policy => policy
        .WithOrigins("https://app.example.com")
        .WithMethods("GET", "POST", "PUT", "DELETE")
        .AllowAnyHeader()
        .AllowCredentials());
});
// ...
app.UseCors("spa");                         // before auth
// or per group: app.MapGroup("/api").RequireCors("spa");
```

## Rate limiting

Built-in middleware (`Microsoft.AspNetCore.RateLimiting`, .NET 7+). Algorithms: fixed window, sliding window, token bucket, concurrency.

```csharp
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.AddFixedWindowLimiter("fixed", limiter =>
    {
        limiter.PermitLimit = 100;
        limiter.Window = TimeSpan.FromMinutes(1);
        limiter.QueueLimit = 0;
    });
    // partition per user/IP for fairness
    options.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(context =>
        RateLimitPartition.GetFixedWindowLimiter(
            context.User.Identity?.Name ?? context.Connection.RemoteIpAddress?.ToString() ?? "anon",
            _ => new FixedWindowRateLimiterOptions { PermitLimit = 100, Window = TimeSpan.FromMinutes(1) }));
});
// ...
app.UseRateLimiter();

app.MapGroup("/api").RequireRateLimiting("fixed");
```

Return `429` with a `Retry-After` header (and ideally a `ProblemDetails` body) when limits are exceeded.
