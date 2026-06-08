# Error Handling & ProblemDetails (ASP.NET Core, .NET 10)

Deep reference for consistent, standards-based API error responses.

## Table of Contents

- [The model: ProblemDetails (RFC 9457)](#the-model-problemdetails-rfc-9457)
- [Register and customize ProblemDetails](#register-and-customize-problemdetails)
- [Global handling with IExceptionHandler](#global-handling-with-iexceptionhandler)
- [Mapping exceptions to status codes](#mapping-exceptions-to-status-codes)
- [Validation problems](#validation-problems)
- [Minimal API error responses](#minimal-api-error-responses)
- [Production hygiene](#production-hygiene)

## The model: ProblemDetails (RFC 9457)

`ProblemDetails` is the standard machine-readable error body for HTTP APIs. RFC 9457 supersedes RFC 7807 (same shape, clarified semantics). Standard members:

| Field | Meaning |
|---|---|
| `type` | URI identifying the problem category (dereferenceable doc, ideally) |
| `title` | Short, human-readable, stable summary |
| `status` | HTTP status code |
| `detail` | Human-readable explanation **for this occurrence** |
| `instance` | URI identifying this specific occurrence |
| *(extensions)* | Any extra members — `traceId`, `errors`, domain codes |

Return `ProblemDetails` for **every** error (4xx and 5xx) so clients get one predictable format. `ValidationProblemDetails` extends it with an `errors` dictionary.

## Register and customize ProblemDetails

`AddProblemDetails()` makes the framework emit `ProblemDetails` for error responses. Use `CustomizeProblemDetails` to attach correlation data to every problem:

```csharp
builder.Services.AddProblemDetails(options =>
{
    options.CustomizeProblemDetails = context =>
    {
        context.ProblemDetails.Instance =
            $"{context.HttpContext.Request.Method} {context.HttpContext.Request.Path}";
        context.ProblemDetails.Extensions["traceId"] =
            Activity.Current?.Id ?? context.HttpContext.TraceIdentifier;
    };
});
```

## Global handling with IExceptionHandler

`IExceptionHandler` is the modern (.NET 8+) way to centralize exception handling — a single-method interface invoked by the built-in exception-handling middleware. No custom middleware required.

```csharp
builder.Services.AddProblemDetails();
builder.Services.AddExceptionHandler<NotFoundExceptionHandler>();    // specific, runs first
builder.Services.AddExceptionHandler<ValidationExceptionHandler>();
builder.Services.AddExceptionHandler<GlobalExceptionHandler>();      // catch-all, runs last

var app = builder.Build();
app.UseExceptionHandler();   // no path -> uses ProblemDetails when AddProblemDetails is registered
```

Handlers run **in registration order**; the first to return `true` handles the exception and stops the chain. Register specific handlers before the catch-all.

```csharp
public sealed class NotFoundExceptionHandler : IExceptionHandler
{
    private readonly IProblemDetailsService _problemDetails;

    public NotFoundExceptionHandler(IProblemDetailsService problemDetails)
    {
        _problemDetails = problemDetails;
    }

    public async ValueTask<bool> TryHandleAsync(
        HttpContext context, Exception exception, CancellationToken ct)
    {
        if (exception is not NotFoundException notFound)
            return false;   // let the next handler try

        context.Response.StatusCode = StatusCodes.Status404NotFound;
        return await _problemDetails.TryWriteAsync(new ProblemDetailsContext
        {
            HttpContext = context,
            Exception = notFound,
            ProblemDetails =
            {
                Status = StatusCodes.Status404NotFound,
                Title = "Resource not found.",
                Detail = notFound.Message
            }
        });
    }
}
```

```csharp
public sealed class GlobalExceptionHandler : IExceptionHandler
{
    private readonly IProblemDetailsService _problemDetails;
    private readonly ILogger<GlobalExceptionHandler> _logger;

    public GlobalExceptionHandler(
        IProblemDetailsService problemDetails, ILogger<GlobalExceptionHandler> logger)
    {
        _problemDetails = problemDetails;
        _logger = logger;
    }

    public async ValueTask<bool> TryHandleAsync(
        HttpContext context, Exception exception, CancellationToken ct)
    {
        _logger.LogError(exception, "Unhandled exception for {Path}", context.Request.Path);

        context.Response.StatusCode = StatusCodes.Status500InternalServerError;
        return await _problemDetails.TryWriteAsync(new ProblemDetailsContext
        {
            HttpContext = context,
            // Note: do NOT pass Exception or its message into the response in production.
            ProblemDetails =
            {
                Status = StatusCodes.Status500InternalServerError,
                Title = "An unexpected error occurred."
            }
        });
    }
}
```

**Critical:** within one handler, pick a single write path. If you set `context.Response` body **and** call `problemDetailsService.TryWriteAsync`, you get a corrupted response or `InvalidOperationException`.

## Mapping exceptions to status codes

A clean pattern is one catch-all handler with an exception→status map, so domain exceptions translate consistently:

```csharp
public sealed class ExceptionToProblemHandler : IExceptionHandler
{
    private static readonly Dictionary<Type, (int Status, string Title)> Map = new()
    {
        [typeof(NotFoundException)]     = (StatusCodes.Status404NotFound, "Resource not found."),
        [typeof(ValidationException)]   = (StatusCodes.Status400BadRequest, "Validation failed."),
        [typeof(ConflictException)]     = (StatusCodes.Status409Conflict, "Conflict."),
        [typeof(UnauthorizedException)] = (StatusCodes.Status403Forbidden, "Forbidden."),
    };

    private readonly IProblemDetailsService _problemDetails;
    private readonly ILogger<ExceptionToProblemHandler> _logger;

    public ExceptionToProblemHandler(
        IProblemDetailsService problemDetails, ILogger<ExceptionToProblemHandler> logger)
    {
        _problemDetails = problemDetails;
        _logger = logger;
    }

    public async ValueTask<bool> TryHandleAsync(
        HttpContext context, Exception exception, CancellationToken ct)
    {
        var (status, title) = Map.TryGetValue(exception.GetType(), out var mapped)
            ? mapped
            : (StatusCodes.Status500InternalServerError, "An unexpected error occurred.");

        if (status == StatusCodes.Status500InternalServerError)
            _logger.LogError(exception, "Unhandled exception");

        context.Response.StatusCode = status;
        return await _problemDetails.TryWriteAsync(new ProblemDetailsContext
        {
            HttpContext = context,
            ProblemDetails =
            {
                Status = status,
                Title = title,
                // Safe to surface message only for expected domain (4xx) exceptions:
                Detail = status < 500 ? exception.Message : null
            }
        });
    }
}
```

## Validation problems

Both styles produce `ValidationProblemDetails` with a field→messages `errors` map.

- **Controllers** (`[ApiController]`): automatic on invalid `ModelState`. For custom validation, call `ValidationProblem(ModelState)`.
- **Minimal APIs**: `TypedResults.ValidationProblem(errors)` where `errors` is `IDictionary<string, string[]>`.

```csharp
return TypedResults.ValidationProblem(new Dictionary<string, string[]>
{
    ["sku"] = ["SKU must be unique."],
    ["price"] = ["Price must be greater than zero."]
});
```

## Minimal API error responses

```csharp
// arbitrary problem
return TypedResults.Problem(
    title: "Payment required",
    statusCode: StatusCodes.Status402PaymentRequired,
    detail: "The subscription is past due.");

// not found / conflict via typed helpers
return TypedResults.NotFound();
return TypedResults.Conflict(new ProblemDetails { Title = "Already exists." });
```

## Production hygiene

- **Never leak internals**: for 5xx, return a generic `title` and omit `detail`/stack traces. Surface `detail` only for expected 4xx domain errors.
- **Log server errors** (5xx) with the exception and a correlation id; don't log expected 4xx as errors.
- **Always include a correlation id** (`traceId`) as an extension so clients can quote it in support requests.
- Use the **Developer Exception Page only in Development** (`app.UseDeveloperExceptionPage()` is automatic in the dev environment); production uses `UseExceptionHandler()`.
- Keep the `type` URIs stable and documented so clients can branch on problem category, not on `title` text.
