# Controller-based Web APIs (ASP.NET Core, .NET 10)

Deep reference for MVC controllers — the right choice for large/established codebases and where you need custom model binding or rich filter pipelines.

## Table of Contents

- [ControllerBase vs Controller](#controllerbase-vs-controller)
- [The [ApiController] attribute](#the-apicontroller-attribute)
- [Routing](#routing)
- [Binding source inference](#binding-source-inference)
- [Action return types](#action-return-types)
- [Content negotiation](#content-negotiation)
- [ProblemDetails and validation](#problemdetails-and-validation)
- [Full controller example](#full-controller-example)

## ControllerBase vs Controller

Web API controllers derive from **`ControllerBase`**. `Controller` adds View/Razor support you don't need for an API and pulls in extra machinery. Only derive from `Controller` if the same class must serve both web pages and API responses.

Register and map controllers:

```csharp
builder.Services.AddControllers();
// ...
app.MapControllers();
```

Use traditional constructor injection with `readonly` fields:

```csharp
[ApiController]
[Route("api/[controller]")]
public class ProductsController : ControllerBase
{
    private readonly IProductService _service;

    public ProductsController(IProductService service)
    {
        _service = service;
    }
}
```

## The [ApiController] attribute

Applying `[ApiController]` opts a controller into API-specific conventions:

1. **Attribute routing required** — no conventional routes; every action is reachable only via `[Route]`/`[HttpGet]`/etc.
2. **Automatic 400** — invalid `ModelState` short-circuits to a 400 `ValidationProblemDetails` before the action runs. The `if (!ModelState.IsValid) return BadRequest(ModelState);` guard is redundant.
3. **Binding source inference** — sources are inferred (see below) so you rarely need `[FromBody]`/`[FromRoute]`/`[FromQuery]`.
4. **Multipart/form-data inference** — `IFormFile`/`IFormFileCollection` params infer `multipart/form-data`.
5. **ProblemDetails for error codes** — error results (≥400) are returned as RFC-compliant `ProblemDetails`.

Apply it per controller, or to a shared base class, or assembly-wide with `[assembly: ApiController]` in `Program.cs` (no per-controller opt-out then).

## Routing

Use attribute routing with token replacement. `[controller]` expands to the class name minus the `Controller` suffix.

```csharp
[Route("api/[controller]")]          // -> api/products
public class ProductsController : ControllerBase
{
    [HttpGet]                         // GET    api/products
    public ... GetAll() { }

    [HttpGet("{id:guid}")]            // GET    api/products/{id}
    public ... GetById(Guid id) { }

    [HttpGet("{id:guid}/reviews")]    // GET    api/products/{id}/reviews
    public ... GetReviews(Guid id) { }

    [HttpPost]                        // POST   api/products
    public ... Create(...) { }
}
```

Prefer **route constraints** (`{id:guid}`, `{page:int:min(1)}`) to validate shape at the routing layer. **Warning:** don't use `[FromRoute]` for values that may contain `%2f` (encoded `/`) — it isn't unescaped; use `[FromQuery]` instead.

## Binding source inference

With `[ApiController]`, sources are inferred as:

| Inferred source | Applies to |
|---|---|
| `[FromServices]` | Complex types registered in DI |
| `[FromBody]` | Complex types **not** in DI (only one allowed; not simple types like `string`/`int`) |
| `[FromForm]` | `IFormFile` / `IFormFileCollection` |
| `[FromRoute]` | Parameter name matches a route token |
| `[FromQuery]` | Everything else |

Override explicitly when inference is wrong (e.g. `[FromBody] string token` for a simple type from the body). Binding more than one parameter from the body throws — combine them into a single DTO.

## Action return types

| Return type | Use when |
|---|---|
| `ActionResult<T>` | You return either a value (`T`) or a status helper (`NotFound()`, `BadRequest()`) — **preferred** |
| `IActionResult` | Multiple result shapes, no single `T` |
| `T` / `Task<T>` | Always 200 with a body, never an error result |
| `IAsyncEnumerable<T>` | Stream a large sequence without buffering (avoid sync `IEnumerable<T>`) |

`ControllerBase` helpers: `Ok`, `CreatedAtAction`, `CreatedAtRoute`, `NoContent`, `NotFound`, `BadRequest`, `Conflict`, `Problem`, `ValidationProblem`, `File`, `Accepted`.

```csharp
[HttpGet("{id:guid}")]
[ProducesResponseType<Product>(StatusCodes.Status200OK)]
[ProducesResponseType(StatusCodes.Status404NotFound)]
public async Task<ActionResult<Product>> GetById(Guid id, CancellationToken ct)
{
    var product = await _service.FindAsync(id, ct);
    return product is null ? NotFound() : Ok(product);
}
```

For a created resource, return 201 with a `Location` header pointing at the read endpoint:

```csharp
return CreatedAtAction(nameof(GetById), new { id = created.Id }, created);
```

## Content negotiation

JSON (`System.Text.Json`) is the default formatter. Use `[Produces]`/`[Consumes]` to constrain media types, and `[ProducesResponseType]` to document status codes for OpenAPI.

```csharp
[ApiController]
[Route("api/[controller]")]
[Produces(MediaTypeNames.Application.Json)]
public class ProductsController : ControllerBase { }

[HttpPost]
[Consumes(MediaTypeNames.Application.Json)]   // 415 if Content-Type differs
public async Task<ActionResult<Product>> Create(CreateProductRequest request, CancellationToken ct) { }
```

Add XML only when a client requires it: `AddControllers().AddXmlSerializerFormatters()`.

## ProblemDetails and validation

`[ApiController]` returns `ValidationProblemDetails` (RFC 9457) automatically for invalid models. To keep custom 400s consistent with the automatic ones, call `ValidationProblem(ModelState)` rather than `BadRequest(ModelState)`.

```csharp
if (!await _service.IsSkuUniqueAsync(request.Sku, ct))
{
    ModelState.AddModelError(nameof(request.Sku), "SKU must be unique.");
    return ValidationProblem(ModelState);
}
```

To log automatic 400s, customize `ApiBehaviorOptions.InvalidModelStateResponseFactory`. To produce a different shape, return your own `IActionResult` from that factory. Pair this with a global `IExceptionHandler` (see error-handling reference) so unhandled exceptions also become `ProblemDetails`.

## Full controller example

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

    [HttpGet]
    [ProducesResponseType<PagedResult<Product>>(StatusCodes.Status200OK)]
    public async Task<ActionResult<PagedResult<Product>>> GetAll(
        [FromQuery] int page = 1, [FromQuery] int pageSize = 20, CancellationToken ct = default)
        => Ok(await _service.SearchAsync(page, pageSize, ct));

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
    [ProducesResponseType<ValidationProblemDetails>(StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<Product>> Create(CreateProductRequest request, CancellationToken ct)
    {
        var created = await _service.CreateAsync(request, ct);
        return CreatedAtAction(nameof(GetById), new { id = created.Id }, created);
    }

    [HttpPut("{id:guid}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Update(Guid id, UpdateProductRequest request, CancellationToken ct)
        => await _service.UpdateAsync(id, request, ct) ? NoContent() : NotFound();

    [HttpDelete("{id:guid}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Delete(Guid id, CancellationToken ct)
        => await _service.DeleteAsync(id, ct) ? NoContent() : NotFound();
}
```
