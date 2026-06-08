# Minimal APIs (ASP.NET Core, .NET 10)

Deep reference for building HTTP APIs with Minimal APIs — Microsoft's recommended style for new projects.

## Table of Contents

- [App skeleton](#app-skeleton)
- [Organize endpoints into modules](#organize-endpoints-into-modules)
- [Route groups](#route-groups)
- [Parameter binding](#parameter-binding)
- [Responses: TypedResults and union return types](#responses-typedresults-and-union-return-types)
- [Validation (.NET 10)](#validation-net-10)
- [Endpoint filters](#endpoint-filters)
- [OpenAPI metadata](#openapi-metadata)
- [Full CRUD module](#full-crud-module)

## App skeleton

Keep `Program.cs` to composition only — services, middleware pipeline, and endpoint module registration.

```csharp
var builder = WebApplication.CreateBuilder(args);

builder.Services.AddOpenApi();
builder.Services.AddValidation();              // .NET 10
builder.Services.AddProblemDetails();
builder.Services.AddScoped<IProductService, ProductService>();

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();                          // /openapi/v1.json
    app.MapScalarApiReference();               // Scalar UI at /scalar/v1
}

app.UseExceptionHandler();
app.UseHttpsRedirection();
app.UseAuthentication();
app.UseAuthorization();

app.MapProductEndpoints();

app.Run();
```

## Organize endpoints into modules

As the API grows, all-endpoints-in-`Program.cs` becomes unmanageable. Put each resource's endpoints in a static class and expose handler logic as named static methods (testable, readable OpenAPI operation IDs).

```csharp
public static class ProductEndpoints
{
    public static RouteGroupBuilder MapProductEndpoints(this IEndpointRouteBuilder routes)
    {
        var group = routes.MapGroup("/api/products").WithTags("Products");

        group.MapGet("/", GetAll);
        group.MapGet("/{id:guid}", GetById).WithName(nameof(GetById));
        group.MapPost("/", Create);
        group.MapPut("/{id:guid}", Update);
        group.MapDelete("/{id:guid}", Delete);

        return group;
    }

    private static async Task<Ok<IReadOnlyList<Product>>> GetAll(
        IProductService svc, CancellationToken ct) =>
        TypedResults.Ok(await svc.GetAllAsync(ct));

    private static async Task<Results<Ok<Product>, NotFound>> GetById(
        Guid id, IProductService svc, CancellationToken ct)
    {
        var product = await svc.FindAsync(id, ct);
        return product is null ? TypedResults.NotFound() : TypedResults.Ok(product);
    }

    // ... Create / Update / Delete below
}
```

## Route groups

`MapGroup` shares a prefix and lets you apply configuration once to every endpoint in the group — auth, filters, CORS, metadata. Groups nest.

```csharp
var api = app.MapGroup("/api");

var products = api.MapGroup("/products")
    .WithTags("Products")
    .RequireAuthorization()                 // every product endpoint needs auth
    .AddEndpointFilter<RequestLoggingFilter>();

var admin = products.MapGroup("/admin")     // /api/products/admin/*
    .RequireAuthorization("AdminOnly");
```

## Parameter binding

Minimal APIs infer the binding source from the parameter type and route template:

| Source | How it binds |
|---|---|
| Route | Parameter name matches a `{token}` in the pattern |
| Query | Simple types not matched by a route token |
| Header | `[FromHeader]` |
| Body (JSON) | Complex types not registered in DI (one body param max) |
| Services (DI) | Types registered in the container |
| Special | `HttpContext`, `HttpRequest`, `ClaimsPrincipal`, `CancellationToken`, `IFormFileCollection`, `Stream` |

Use `[AsParameters]` to bind many query/route values into a single struct/record — great for filtering and pagination:

```csharp
public readonly record struct ProductQuery(
    [FromQuery] int Page = 1,
    [FromQuery] int PageSize = 20,
    [FromQuery] string? Search = null);

group.MapGet("/", async ([AsParameters] ProductQuery query, IProductService svc, CancellationToken ct) =>
    TypedResults.Ok(await svc.SearchAsync(query, ct)));
```

For custom binding, implement `BindAsync` (whole-parameter) or `TryParse` (route/query string) on the type.

## Responses: TypedResults and union return types

Prefer `TypedResults` over `Results` — it returns a concrete type, which:

- gives compile-time safety and easy unit testing (assert on the typed result), and
- contributes accurate response metadata to OpenAPI automatically.

Declare an explicit `Results<T1, T2, ...>` union as the handler return type so the framework and OpenAPI see every possible status:

```csharp
group.MapPost("/", async Task<Results<Created<Product>, ValidationProblem, Conflict<ProblemDetails>>> (
    CreateProductRequest request, IProductService svc, CancellationToken ct) =>
{
    if (await svc.ExistsAsync(request.Sku, ct))
        return TypedResults.Conflict(new ProblemDetails { Title = "SKU already exists." });

    var created = await svc.CreateAsync(request, ct);
    return TypedResults.Created($"/api/products/{created.Id}", created);
});
```

Common helpers: `Ok`, `Created`, `CreatedAtRoute`, `NoContent`, `NotFound`, `BadRequest`, `Conflict`, `Problem`, `ValidationProblem`, `Accepted`, `File`, `Stream`.

## Validation (.NET 10)

Built-in validation generates validators from DataAnnotations on bound types and runs them via an endpoint filter before your handler:

```csharp
builder.Services.AddValidation();

public record CreateProductRequest(
    [property: Required, StringLength(100)] string Name,
    [property: Range(0.01, 100_000)] decimal Price,
    [property: Required, RegularExpression("^[A-Z0-9-]+$")] string Sku);
```

Invalid requests yield a `ValidationProblem` (400) automatically — no handler code needed. For rules DataAnnotations can't express, use FluentValidation behind an endpoint filter (see next section). On .NET 8/9 (no built-in validation), the FluentValidation-in-a-filter approach is the standard pattern.

## Endpoint filters

Filters wrap handler execution for cross-cutting concerns — validation, logging, short-circuiting. They run in order; place validation before the handler. Apply per-endpoint or to a whole group.

```csharp
public sealed class FluentValidationFilter<T> : IEndpointFilter
{
    private readonly IValidator<T> _validator;

    public FluentValidationFilter(IValidator<T> validator)
    {
        _validator = validator;
    }

    public async ValueTask<object?> InvokeAsync(
        EndpointFilterInvocationContext context, EndpointFilterDelegate next)
    {
        var argument = context.Arguments.OfType<T>().FirstOrDefault();
        if (argument is not null)
        {
            var result = await _validator.ValidateAsync(argument, context.HttpContext.RequestAborted);
            if (!result.IsValid)
                return TypedResults.ValidationProblem(result.ToDictionary());
        }
        return await next(context);
    }
}

// usage
group.MapPost("/", Create).AddEndpointFilter<FluentValidationFilter<CreateProductRequest>>();
```

## OpenAPI metadata

Enrich the generated document with fluent metadata:

```csharp
group.MapGet("/{id:guid}", GetById)
    .WithName("GetProductById")
    .WithSummary("Retrieve a product by its identifier")
    .WithDescription("Returns 404 when no product matches the id.")
    .Produces<Product>(StatusCodes.Status200OK)
    .Produces(StatusCodes.Status404NotFound);
```

`TypedResults` already supplies most response metadata; add `.Produces`/`.WithSummary` only where you need detail the types don't convey.

## Full CRUD module

```csharp
public static class ProductEndpoints
{
    public static RouteGroupBuilder MapProductEndpoints(this IEndpointRouteBuilder routes)
    {
        var group = routes.MapGroup("/api/products").WithTags("Products");

        group.MapGet("/", GetAll);
        group.MapGet("/{id:guid}", GetById).WithName(nameof(GetById));
        group.MapPost("/", Create)
             .AddEndpointFilter<FluentValidationFilter<CreateProductRequest>>();
        group.MapPut("/{id:guid}", Update);
        group.MapDelete("/{id:guid}", Delete);

        return group;
    }

    private static async Task<Ok<PagedResult<Product>>> GetAll(
        [AsParameters] ProductQuery query, IProductService svc, CancellationToken ct) =>
        TypedResults.Ok(await svc.SearchAsync(query, ct));

    private static async Task<Results<Ok<Product>, NotFound>> GetById(
        Guid id, IProductService svc, CancellationToken ct)
    {
        var product = await svc.FindAsync(id, ct);
        return product is null ? TypedResults.NotFound() : TypedResults.Ok(product);
    }

    private static async Task<Results<CreatedAtRoute<Product>, Conflict<ProblemDetails>>> Create(
        CreateProductRequest request, IProductService svc, CancellationToken ct)
    {
        if (await svc.ExistsAsync(request.Sku, ct))
            return TypedResults.Conflict(new ProblemDetails { Title = "SKU already exists." });

        var created = await svc.CreateAsync(request, ct);
        return TypedResults.CreatedAtRoute(created, nameof(GetById), new { id = created.Id });
    }

    private static async Task<Results<NoContent, NotFound>> Update(
        Guid id, UpdateProductRequest request, IProductService svc, CancellationToken ct)
    {
        var updated = await svc.UpdateAsync(id, request, ct);
        return updated ? TypedResults.NoContent() : TypedResults.NotFound();
    }

    private static async Task<Results<NoContent, NotFound>> Delete(
        Guid id, IProductService svc, CancellationToken ct)
    {
        var deleted = await svc.DeleteAsync(id, ct);
        return deleted ? TypedResults.NoContent() : TypedResults.NotFound();
    }
}
```

Notes: every handler is `async` and takes a `CancellationToken`; bodies bind to request records, not entities; responses return DTOs; the union return types make the OpenAPI document exhaustive.
