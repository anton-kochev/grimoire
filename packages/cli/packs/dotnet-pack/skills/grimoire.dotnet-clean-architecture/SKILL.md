---
name: grimoire.dotnet-clean-architecture
description: "Clean Architecture best practices for modern .NET (current: .NET 10) — the Dependency Rule, layer responsibilities (Domain, Application, Infrastructure, Presentation), and the 4-project solution layout, with rich domain models, value objects, domain events, the result pattern, and CQRS with or without MediatR (commercial since v13 — covers Wolverine and plain handler alternatives). Includes architecture tests with ArchUnitNET, when NOT to use Clean Architecture (vertical slice and hybrid approaches), and avoiding over-abstraction: generic repositories over EF Core, interface-for-everything, anemic domains, leaky IQueryable boundaries. Use when structuring a .NET solution, designing or reviewing layers, or deciding where business logic belongs. Triggers: clean architecture, onion architecture, hexagonal, ports and adapters, dependency rule, domain layer, application layer, use case, CQRS, MediatR, Wolverine, value object, domain event, anemic model, repository pattern, vertical slice, ArchUnitNET."
---

# Clean Architecture for .NET

How to apply Clean Architecture properly on modern .NET. Examples target **.NET 10** and reflect the current (2026) ecosystem — including the MediatR licensing change and the shift toward pragmatic, hybrid architectures. The focus is **solution structure and where logic belongs** — C# language idioms, web API design, and testing mechanics have their own skills.

This skill provides guidance, not enforcement. Check the project's existing structure first and match it. Don't restructure a working solution unless asked.

## Should you use Clean Architecture?

Match architectural ceremony to domain complexity — this is the single most important decision.

| Your project | Recommendation |
|---|---|
| Complex business rules, long-lived (5+ years), large team | Clean Architecture — the layer boundaries pay for themselves |
| CRUD-heavy, API-focused, rapid delivery, shifting requirements | Vertical slice architecture — feature folders, minimal layering |
| Mixed: mostly simple, a few genuinely complex areas | Hybrid (the modern default) — feature folders at the macro level, clean-architecture discipline inside the complex features |
| Microservice candidates | Vertical slices — slices become service boundaries |

**The cost is real**: in a fully-layered solution, a trivial feature can touch 8–10 files across 4 projects. Don't pay that tax for a simple domain. Conversely, complex invariants scattered through handlers and controllers cost far more over time.

→ Deep dive (incl. vertical slice and hybrid layouts): **[reference/solution-structure.md](reference/solution-structure.md)**

## The Dependency Rule & solution layout

One rule makes everything work: **source-code dependencies point inward only**. Domain references nothing. Nothing inner knows anything about anything outer.

```text
            ┌──────────────────────────────┐
            │   Web (Presentation)         │──┐
            │   endpoints, composition root│  │
            └──────────────┬───────────────┘  │
                           │ references       │ references
            ┌──────────────▼───────────────┐  │
            │   Infrastructure             │  │
            │   EF Core, external services │  │
            └──────────────┬───────────────┘  │
                           │ references       │
            ┌──────────────▼───────────────┐  │
            │   Application                │◄─┘
            │   use cases, ports, validation
            └──────────────┬───────────────┘
                           │ references
            ┌──────────────▼───────────────┐
            │   Domain                     │
            │   entities, value objects,   │
            │   domain events, invariants  │
            └──────────────────────────────┘
```

| Layer | Contains | Must NOT reference |
|---|---|---|
| **Domain** | Entities, value objects, domain events, domain services, domain exceptions | Anything — no NuGet framework packages, no EF Core, no other project |
| **Application** | Use-case handlers, port interfaces (abstractions), validators, DTOs | EF Core, ASP.NET Core, Infrastructure |
| **Infrastructure** | DbContext + EF configurations, external service adapters, port implementations | Web |
| **Web (Presentation)** | Endpoints/controllers, request/response contracts, `Program.cs` composition root | Domain internals directly (go through Application) |

→ Deep dive: **[reference/solution-structure.md](reference/solution-structure.md)**

## Domain modeling quick-reference

| Rule | Do this |
|---|---|
| Rich, not anemic | Behavior lives **on the entity** — invariants enforced in methods, not in handlers checking flags |
| Guard the invariants | Private setters, factory methods, guard clauses; an entity can never exist in an invalid state |
| Value objects for concepts | `record` types with validation at creation — `Money`, `Email`, `DateRange` — equality by value |
| Encapsulate collections | Private `List<T>` field, expose `IReadOnlyCollection<T>`; mutations only via entity methods |
| Domain events for side effects | Entity raises the event; dispatch happens at `SaveChanges` — keeps aggregates decoupled |
| Result pattern for expected failures | `Result<T>` for business-rule violations; exceptions for bugs and truly exceptional states |

```csharp
public sealed class Order
{
    private readonly List<OrderLine> _lines = [];
    public IReadOnlyCollection<OrderLine> Lines => _lines.AsReadOnly();

    public Result Ship()
    {
        if (_lines.Count == 0)
            return Result.Failure(OrderErrors.EmptyOrderCannotShip);

        Status = OrderStatus.Shipped;
        Raise(new OrderShippedDomainEvent(Id));
        return Result.Success();
    }
}
```

→ Deep dive: **[reference/domain-layer.md](reference/domain-layer.md)**

## Use cases & CQRS quick-reference

| Rule | Do this |
|---|---|
| One handler per use case | A single class with one public method — the unit of testing and of change |
| Thin orchestration, fat domain | The handler loads aggregates, calls domain methods, saves — business rules live in Domain |
| CQRS is a pattern, not a library | Commands mutate via the domain; queries may bypass it entirely (Dapper/EF projections straight to DTOs) |
| Ports are owned by Application | Define `IEmailSender`, `IApplicationDbContext` where they're *consumed*; Infrastructure implements them |
| Validate at the boundary | Input validation (FluentValidation) on the command; business invariants stay in the domain |

> **MediatR is commercial since v13** (April 2025). Options, in order of preference for new projects: **plain handler interfaces + DI** (no dependency, shown below), **Wolverine** (source-generated, adds retries/sagas/outbox), or **pin MediatR 12.x** (last free version). Don't pick a mediator library by habit — most solutions only use 10% of it.

```csharp
public interface ICommandHandler<in TCommand, TResult>
{
    Task<TResult> Handle(TCommand command, CancellationToken ct);
}

public sealed class ShipOrderHandler : ICommandHandler<ShipOrderCommand, Result>
{
    private readonly IApplicationDbContext _db;

    public ShipOrderHandler(IApplicationDbContext db) => _db = db;

    public async Task<Result> Handle(ShipOrderCommand command, CancellationToken ct)
    {
        var order = await _db.Orders.FindAsync([command.OrderId], ct);
        if (order is null) return Result.Failure(OrderErrors.NotFound);

        var result = order.Ship();          // business rule lives in the domain
        if (result.IsFailure) return result;

        await _db.SaveChangesAsync(ct);
        return Result.Success();
    }
}
```

→ Deep dive (incl. dispatch without MediatR, decorator pipelines): **[reference/application-layer.md](reference/application-layer.md)**

## Avoiding over-abstraction

The most common Clean Architecture failure is too much of it.

| Anti-pattern | Instead |
|---|---|
| Generic `IRepository<T>` wrapping EF Core | `DbContext` already is a repository + unit of work; expose it via a port (`IApplicationDbContext`) or write specific repositories for genuine aggregate-access patterns |
| Interface for every class | Abstract only what you swap or mock at a boundary (I/O, time, external services) — not handlers, not domain services with one implementation |
| `IQueryable<T>` across layer boundaries | Return materialized results/DTOs; an exposed `IQueryable` leaks EF semantics and makes the boundary a lie |
| Layering a trivial CRUD feature | Collapse it — endpoint + DbContext is fine for simple reads; save the ceremony for real logic |

→ Deep dive: **[reference/testing-and-antipatterns.md](reference/testing-and-antipatterns.md)**

## Testing the architecture

| What | How |
|---|---|
| Domain | Plain unit tests, **no mocks** — the payoff of a rich domain model |
| Use-case handlers | Unit tests mocking ports only |
| Dependency rule | Architecture tests in CI — **ArchUnitNET** (NetArchTest is unmaintained since 2023; `NetArchTest.eNhancedEdition` is the fallback) |
| Infrastructure | Integration tests against real dependencies (Testcontainers) |

```csharp
[Fact]
public void Domain_Should_Not_Depend_On_Outer_Layers() =>
    Types().That().ResideInAssembly(DomainAssembly)
        .Should().NotDependOnAny(
            Types().That().ResideInAssembly(ApplicationAssembly, InfrastructureAssembly))
        .Check(Architecture);
```

→ Deep dive: **[reference/testing-and-antipatterns.md](reference/testing-and-antipatterns.md)**

## Which reference file do I need?

| You're working on… | Open |
|---|---|
| Project layout, composition root, vertical slice / hybrid decision | `reference/solution-structure.md` |
| Entities, value objects, domain events, result pattern | `reference/domain-layer.md` |
| Handlers, CQRS, ports, MediatR alternatives, validation | `reference/application-layer.md` |
| EF Core, repositories, external services, endpoints, DTO mapping | `reference/infrastructure-and-presentation.md` |
| Architecture tests, test strategy, anti-pattern catalog | `reference/testing-and-antipatterns.md` |

Recommendations draw on Jason Taylor's CleanArchitecture template (.NET 10), the Ardalis template, Milan Jovanovic's Clean Architecture writings, and Microsoft's architecture guidance — cited in the reference files.
