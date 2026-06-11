# Testing the architecture & anti-pattern catalog

How each layer gets tested, how the dependency rule gets enforced in CI, and the failure modes to refuse.

## Contents

- [Test strategy per layer](#test-strategy-per-layer)
- [Domain unit tests](#domain-unit-tests)
- [Handler unit tests](#handler-unit-tests)
- [Architecture tests with ArchUnitNET](#architecture-tests-with-archunitnet)
- [Integration tests](#integration-tests)
- [Anti-pattern catalog](#anti-pattern-catalog)

---

## Test strategy per layer

| Layer | Test type | Tooling | Mocks? |
|---|---|---|---|
| Domain | Unit | xUnit/TUnit | **None** — that's the payoff |
| Application handlers | Unit | xUnit/TUnit + NSubstitute/Moq | Ports only |
| Dependency rule | Architecture | ArchUnitNET | n/a |
| Infrastructure | Integration | Testcontainers + real provider | No — real database |
| Endpoints | Integration | `WebApplicationFactory` | External services only |

The shape this produces: many fast domain tests, a moderate number of handler tests, a handful of architecture tests, and integration tests for the seams. For framework selection and mocking mechanics, defer to the `grimoire.unit-testing-dotnet` skill.

---

## Domain unit tests

A rich domain model tests like a pure library — construct, act, assert. No mocks, no setup ceremony:

```csharp
[Fact]
public void Ship_EmptyOrder_Fails()
{
    var order = Order.Create(CustomerId.New());

    var result = order.Ship();

    Assert.True(result.IsFailure);
    Assert.Equal(OrderErrors.EmptyOrderCannotShip, result.Error);
}

[Fact]
public void Ship_PaidOrderWithLines_RaisesOrderShipped()
{
    var order = OrderFactory.PaidWithOneLine();   // test builder, not mocks

    var result = order.Ship();

    Assert.True(result.IsSuccess);
    Assert.Contains(order.DomainEvents, e => e is OrderShippedDomainEvent);
}
```

If domain tests need mocks, the domain has hidden dependencies — push them out behind method parameters or move the logic.

---

## Handler unit tests

Handlers depend only on ports, so tests substitute exactly those:

```csharp
[Fact]
public async Task Handle_OrderNotFound_ReturnsNotFound()
{
    var db = Substitute.For<IApplicationDbContext>();
    db.Orders.Returns(EmptyDbSet<Order>());
    var handler = new ShipOrderHandler(db, new FakeClock());

    var result = await handler.Handle(new ShipOrderCommand(OrderId.New()), default);

    Assert.Equal(OrderErrors.NotFound, result.Error);
}
```

Keep these tests about **orchestration outcomes** (not-found paths, save-called-once, result mapping). Business-rule cases belong in domain tests — don't re-test `Ship()`'s rules through the handler; that duplicates coverage at higher cost. If mocking `DbSet` gets painful, that's a hint the handler logic is query-heavy and better covered by an integration test.

---

## Architecture tests with ArchUnitNET

The dependency rule is a build-time fact between *projects*, but conventions inside a project (and the "Web never uses Infrastructure types" rule) need tests. **ArchUnitNET** is the maintained choice; NetArchTest's last release was 2023 (if a codebase already uses its fluent API, `NetArchTest.eNhancedEdition` is the maintained drop-in).

```csharp
using ArchUnitNET.Domain;
using ArchUnitNET.Loader;
using ArchUnitNET.xUnit;
using static ArchUnitNET.Fluent.ArchRuleDefinition;

public sealed class ArchitectureTests
{
    private static readonly Architecture Architecture = new ArchLoader()
        .LoadAssemblies(
            typeof(Order).Assembly,                  // Domain
            typeof(ShipOrderHandler).Assembly,       // Application
            typeof(ApplicationDbContext).Assembly,   // Infrastructure
            typeof(Program).Assembly)                // Web
        .Build();

    private static readonly IObjectProvider<IType> DomainLayer =
        Types().That().ResideInAssembly(typeof(Order).Assembly).As("Domain");
    private static readonly IObjectProvider<IType> ApplicationLayer =
        Types().That().ResideInAssembly(typeof(ShipOrderHandler).Assembly).As("Application");
    private static readonly IObjectProvider<IType> InfrastructureLayer =
        Types().That().ResideInAssembly(typeof(ApplicationDbContext).Assembly).As("Infrastructure");
    private static readonly IObjectProvider<IType> WebLayer =
        Types().That().ResideInAssembly(typeof(Program).Assembly).As("Web");

    [Fact]
    public void Domain_DependsOn_Nothing_Outer() =>
        Types().That().Are(DomainLayer)
            .Should().NotDependOnAny(ApplicationLayer)
            .AndShould().NotDependOnAny(InfrastructureLayer)
            .AndShould().NotDependOnAny(WebLayer)
            .Check(Architecture);

    [Fact]
    public void Application_DoesNotDependOn_Infrastructure() =>
        Types().That().Are(ApplicationLayer)
            .Should().NotDependOnAny(InfrastructureLayer)
            .Check(Architecture);

    [Fact]
    public void Web_DoesNotUse_Infrastructure_ExceptCompositionRoot() =>
        Types().That().Are(WebLayer).And().AreNot(typeof(Program))
            .Should().NotDependOnAny(InfrastructureLayer)
            .Check(Architecture);

    [Fact]
    public void Handlers_Are_Sealed_And_Named_Handler() =>
        Classes().That().ImplementInterface(typeof(ICommandHandler<,>))
            .Should().BeSealed()
            .AndShould().HaveNameEndingWith("Handler")
            .Check(Architecture);
}
```

Run these in CI with the unit tests. They catch the violations that project references can't: Web using `ApplicationDbContext` directly, a handler left unsealed, a domain type acquiring an outward dependency through a shared utility project.

---

## Integration tests

Infrastructure earns real-dependency tests: EF configurations, migrations, query projections, and the domain-event interceptor against a real database via **Testcontainers**; endpoints via `WebApplicationFactory`. Don't test EF mappings with the in-memory provider — it diverges from relational behavior exactly where bugs live (translations, transactions, constraints).

Mechanics (fixtures, container lifecycle, `WebApplicationFactory` setup) are covered by the `grimoire.unit-testing-dotnet` skill.

---

## Anti-pattern catalog

| Anti-pattern | Smell | Fix |
|---|---|---|
| **Anemic domain** | Entities are property bags; handlers read flags and set state | Move the decision onto the entity as a method returning `Result`; handler calls it |
| **Business logic in handlers** | The same `if (order.Status == ...)` appears in three handlers | Same fix — one rule, one home, on the aggregate |
| **Generic repository over EF Core** | `IRepository<T>` with CRUD methods mirroring `DbSet` | Delete it; use the `IApplicationDbContext` port, or a specific repository with domain-question methods |
| **Interface-for-everything** | `IOrderService` + `OrderService`, one implementation, never mocked across a boundary | Inline the class; abstract only I/O, time, and external systems |
| **IQueryable across boundaries** | Port methods return `IQueryable<T>` | Return materialized DTOs/lists with explicit paging parameters |
| **Domain references EF Core** | `[MaxLength]` on an entity, `using Microsoft.EntityFrameworkCore;` in Domain | Move mapping to `IEntityTypeConfiguration<T>` in Infrastructure |
| **Fake abstraction layer** | A "service" or "manager" that forwards every call to one dependency, adding nothing | Delete the layer; depth comes from logic, not from hop count |
| **Ceremony for trivial features** | A one-line change touches 8–10 files across 4 projects, regularly | Collapse simple paths: query handlers projecting straight to DTOs, or endpoint-level reads; consider the hybrid layout (`solution-structure.md`) |
| **Validators doing domain work** | FluentValidation rules querying the database for business state | Input shape in validators; business rules in the domain (`application-layer.md`) |
| **Domain events for everything** | Trivial same-aggregate updates routed through events | Events are for cross-aggregate/cross-cutting reactions; in-aggregate consistency is just a method call |

The meta-rule behind most of these: **every layer and abstraction must earn its existence** by protecting an invariant, isolating a real dependency, or enabling a test. Anything that exists "because Clean Architecture says so" is cargo cult — Clean Architecture doesn't say so.

Sources: [ArchUnitNET](https://github.com/TNG/ArchUnitNET) · [NetArchTest (unmaintained)](https://github.com/BenMorris/NetArchTest) · [Architecture testing (Milan Jovanovic)](https://www.milanjovanovic.tech/blog/shift-left-with-architecture-testing-in-dotnet) · [Clean Architecture disadvantages (James Hickey)](https://www.jamesmichaelhickey.com/clean-architecture/)
