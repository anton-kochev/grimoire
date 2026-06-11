# Application layer

Use cases, ports, CQRS, and how to do all of it with or without a mediator library.

## Contents

- [Use cases as handlers](#use-cases-as-handlers)
- [Ports: abstractions owned by Application](#ports-abstractions-owned-by-application)
- [CQRS: the pattern vs the tool](#cqrs-the-pattern-vs-the-tool)
- [The MediatR situation (2025+)](#the-mediatr-situation-2025)
- [Plain-handler dispatch with DI](#plain-handler-dispatch-with-di)
- [Cross-cutting concerns via decorators](#cross-cutting-concerns-via-decorators)
- [Validation placement](#validation-placement)

---

## Use cases as handlers

One class per use case, one public method. This is the unit of testing, the unit of change, and the thing a feature folder is named after.

The handler's job is **orchestration**: load aggregates, call domain methods, persist, map to a response. The moment a handler contains an `if` about business state, ask whether that decision belongs on the entity.

```csharp
public sealed class ShipOrderHandler : ICommandHandler<ShipOrderCommand, Result>
{
    private readonly IApplicationDbContext _db;
    private readonly IDateTimeProvider _clock;

    public ShipOrderHandler(IApplicationDbContext db, IDateTimeProvider clock)
    {
        _db = db;
        _clock = clock;
    }

    public async Task<Result> Handle(ShipOrderCommand command, CancellationToken ct)
    {
        var order = await _db.Orders
            .FirstOrDefaultAsync(o => o.Id == command.OrderId, ct);
        if (order is null) return Result.Failure(OrderErrors.NotFound);

        var result = order.Ship(_clock.UtcNow);   // rules live in Domain
        if (result.IsFailure) return result;

        await _db.SaveChangesAsync(ct);
        return Result.Success();
    }
}
```

Thin orchestration, fat domain. A handler longer than ~30 lines is usually doing the domain's job.

---

## Ports: abstractions owned by Application

A port is an interface the Application **consumes** and Infrastructure **implements**. Define it in the layer that needs it, shaped by what that layer needs — not by what the implementation offers.

```csharp
// MyApp.Application/Abstractions/
public interface IApplicationDbContext
{
    DbSet<Order> Orders { get; }
    DbSet<Customer> Customers { get; }
    Task<int> SaveChangesAsync(CancellationToken ct);
}

public interface IEmailSender
{
    Task SendAsync(Email to, string subject, string body, CancellationToken ct);
}

public interface IDateTimeProvider
{
    DateTime UtcNow { get; }
}
```

Notes:

- `IApplicationDbContext` exposing `DbSet<T>` requires Application to reference `Microsoft.EntityFrameworkCore` (the abstractions, not a provider). The Taylor template accepts this trade — `DbSet` is the port. If you want zero EF in Application, use specific repository ports instead (the Ardalis route). Pick one; don't do both.
- Abstract **time** (`IDateTimeProvider` or .NET 8+ `TimeProvider`) and any I/O — those are the seams tests need.
- Don't create a port for something with one implementation that never crosses a boundary (see over-abstraction in `testing-and-antipatterns.md`).

---

## CQRS: the pattern vs the tool

CQRS is just this: **commands** change state and go through the domain model; **queries** read state and can take the shortest path to a DTO. No library required.

The asymmetry is the point:

- Commands: load aggregate → call domain method → save. Consistency and invariants matter.
- Queries: project straight from the database to the response type — EF `.Select()` projections or Dapper. Loading aggregates, tracking changes, and mapping through the domain just to *read* is waste; no invariants are at risk.

```csharp
public sealed class GetOrderByIdHandler : IQueryHandler<GetOrderByIdQuery, OrderResponse?>
{
    private readonly IApplicationDbContext _db;

    public GetOrderByIdHandler(IApplicationDbContext db) => _db = db;

    public Task<OrderResponse?> Handle(GetOrderByIdQuery query, CancellationToken ct) =>
        _db.Orders
            .Where(o => o.Id == query.OrderId)
            .Select(o => new OrderResponse(o.Id.Value, o.Status.ToString(),
                o.Lines.Sum(l => l.UnitPrice.Amount * l.Quantity)))
            .FirstOrDefaultAsync(ct);
}
```

Separate read/write databases, event sourcing, etc. are optional extensions — don't let "full CQRS" ambitions complicate a system that needs only the handler split. When those extensions are genuinely on the table (dedicated read models, separate stores, outbox, Marten), the `grimoire.dotnet-cqrs` skill covers them in depth.

---

## The MediatR situation (2025+)

MediatR announced it was going commercial in April 2025; v13+ requires a paid license for most commercial use. Decision table for the dispatch mechanism:

| Option | When |
|---|---|
| **Plain handler interfaces + DI** (below) | Default for new projects — zero dependencies, fully debuggable, you own the 50 lines |
| **Wolverine** | You want what MediatR never had anyway: source-generated dispatch, retries, sagas, scheduling, transactional outbox |
| **Pin MediatR 12.x** | Existing codebase deeply invested; 12.x stays free (Apache 2.0) but unmaintained |
| **Pay for MediatR v13+** | Existing investment + budget; smooth upgrade path |

Most solutions use a mediator for exactly two things — decoupled dispatch and pipeline behaviors — and both are trivial to own. A fuller trade-off table covering the wider field (Cortex.Mediator, Brighter, FastEndpoints) is in the `grimoire.dotnet-cqrs` skill.

---

## Plain-handler dispatch with DI

The complete no-dependency setup. Interfaces:

```csharp
public interface ICommand<TResult> { }
public interface IQuery<TResult> { }

public interface ICommandHandler<in TCommand, TResult> where TCommand : ICommand<TResult>
{
    Task<TResult> Handle(TCommand command, CancellationToken ct);
}

public interface IQueryHandler<in TQuery, TResult> where TQuery : IQuery<TResult>
{
    Task<TResult> Handle(TQuery query, CancellationToken ct);
}
```

Registration — scan once with Scrutor (or list registrations manually, it's not many lines):

```csharp
services.Scan(scan => scan
    .FromAssembliesOf(typeof(DependencyInjection))
    .AddClasses(c => c.AssignableTo(typeof(ICommandHandler<,>)), publicOnly: false)
        .AsImplementedInterfaces().WithScopedLifetime()
    .AddClasses(c => c.AssignableTo(typeof(IQueryHandler<,>)), publicOnly: false)
        .AsImplementedInterfaces().WithScopedLifetime());
```

Endpoints inject the handler they need directly — no mediator indirection at all:

```csharp
app.MapPost("/orders/{id}/ship",
    async (Guid id, ICommandHandler<ShipOrderCommand, Result> handler, CancellationToken ct) =>
    {
        var result = await handler.Handle(new ShipOrderCommand(new OrderId(id)), ct);
        return result.IsSuccess ? Results.NoContent() : result.ToProblemDetails();
    });
```

What you give up vs a mediator: dynamic dispatch from a non-generic context (rarely needed) and notification fan-out (use domain events for that — see `domain-layer.md`).

---

## Cross-cutting concerns via decorators

MediatR pipeline behaviors are just the decorator pattern. Scrutor's `Decorate` wires them generically:

```csharp
public sealed class ValidationDecorator<TCommand, TResult> : ICommandHandler<TCommand, TResult>
    where TCommand : ICommand<TResult>
{
    private readonly ICommandHandler<TCommand, TResult> _inner;
    private readonly IEnumerable<IValidator<TCommand>> _validators;

    public ValidationDecorator(
        ICommandHandler<TCommand, TResult> inner,
        IEnumerable<IValidator<TCommand>> validators)
    {
        _inner = inner;
        _validators = validators;
    }

    public async Task<TResult> Handle(TCommand command, CancellationToken ct)
    {
        foreach (var validator in _validators)
        {
            var validation = await validator.ValidateAsync(command, ct);
            if (!validation.IsValid) throw new ValidationException(validation.Errors);
        }
        return await _inner.Handle(command, ct);
    }
}

// registration order = execution order, outermost last
services.Decorate(typeof(ICommandHandler<,>), typeof(ValidationDecorator<,>));
services.Decorate(typeof(ICommandHandler<,>), typeof(LoggingDecorator<,>));
```

The same shape covers logging, metrics, transactions, and idempotency. Decorate commands only — queries usually need at most logging.

---

## Validation placement

Three kinds of validation, three homes:

| Kind | Example | Where |
|---|---|---|
| **Input shape** | "email is required", "quantity must be positive" | FluentValidation validator on the command, run by the validation decorator |
| **Business invariants** | "only paid orders ship" | Domain — entity methods returning `Result` |
| **Existence / authorization** | "order exists", "user owns this order" | Handler (existence) / endpoint or decorator (authz) |

The mistake to avoid: putting business rules in FluentValidation validators. A validator that queries the database to check order state is a domain rule in disguise — it will be skipped the next time the rule is needed from a different entry point.

Sources: [CQRS pattern (Microsoft)](https://learn.microsoft.com/en-us/azure/architecture/patterns/cqrs) · [MediatR going commercial (GitHub discussion)](https://github.com/ardalis/CleanArchitecture/discussions/935) · [Wolverine](https://wolverinefx.net/) · [Jason Taylor template](https://github.com/jasontaylordev/CleanArchitecture)
