# Infrastructure & Presentation

The outer layers: EF Core, external services, endpoints, and the wiring that keeps the inner layers clean.

## Contents

- [EF Core implements the port](#ef-core-implements-the-port)
- [Entity configurations](#entity-configurations)
- [Repositories: when and when not](#repositories-when-and-when-not)
- [Never leak IQueryable](#never-leak-iqueryable)
- [External services as adapters](#external-services-as-adapters)
- [Domain event dispatching](#domain-event-dispatching)
- [Presentation: endpoints and DTOs](#presentation-endpoints-and-dtos)

---

## EF Core implements the port

The `DbContext` lives in Infrastructure and implements the Application port:

```csharp
// MyApp.Infrastructure/Persistence/ApplicationDbContext.cs
public sealed class ApplicationDbContext : DbContext, IApplicationDbContext
{
    public ApplicationDbContext(DbContextOptions<ApplicationDbContext> options)
        : base(options) { }

    public DbSet<Order> Orders => Set<Order>();
    public DbSet<Customer> Customers => Set<Customer>();

    protected override void OnModelCreating(ModelBuilder modelBuilder) =>
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(ApplicationDbContext).Assembly);
}
```

Handlers depend on `IApplicationDbContext`; only migrations, configurations, and the composition root see the concrete class.

---

## Entity configurations

All mapping lives in `IEntityTypeConfiguration<T>` classes in Infrastructure — never as attributes on domain types:

```csharp
public sealed class OrderConfiguration : IEntityTypeConfiguration<Order>
{
    public void Configure(EntityTypeBuilder<Order> builder)
    {
        builder.HasKey(o => o.Id);

        builder.Property(o => o.Id)                       // strongly-typed ID conversion
            .HasConversion(id => id.Value, value => new OrderId(value));

        builder.Property(o => o.Status).HasConversion<string>();

        builder.HasMany(o => o.Lines)
            .WithOne()
            .HasForeignKey(l => l.OrderId);

        builder.Navigation(o => o.Lines)
            .UsePropertyAccessMode(PropertyAccessMode.Field);   // encapsulated collection

        builder.OwnsOne(o => o.ShippingAddress);          // value object as owned type
    }
}
```

This is what makes the "no EF attributes in Domain" rule workable: every persistence concern has a home, one class per aggregate.

---

## Repositories: when and when not

**`DbContext` is already a repository and unit of work** — `DbSet<T>` is the repository, `SaveChanges` is the unit of work. Microsoft's EF docs say so explicitly. So:

- **Don't** wrap EF Core in a generic `IRepository<T>` with `GetById/Add/Update/Delete`. It re-exposes EF's surface with less power, blocks `Include`/projections where you need them, and abstracts nothing — you will never swap EF for something satisfying the same interface.
- **Do** add a *specific* repository when an aggregate has genuinely complex access patterns worth naming:

```csharp
// Application port — shaped by what handlers need, not by CRUD symmetry
public interface IOrderRepository
{
    Task<Order?> GetWithLinesAsync(OrderId id, CancellationToken ct);
    Task<bool> HasPendingOrdersAsync(CustomerId customerId, CancellationToken ct);
    void Add(Order order);
}
```

The test: if the repository's methods mirror `DbSet` one-to-one, delete it and use the `IApplicationDbContext` port. If its methods read like domain questions (`HasPendingOrdersAsync`), keep it.

Either way, queries for *reads* (CQRS query side) skip repositories entirely and project to DTOs.

---

## Never leak IQueryable

Returning `IQueryable<T>` across a layer boundary looks flexible and is a trap:

- The query executes **later**, somewhere that doesn't know it owns a live database query — often after the `DbContext` is disposed.
- The boundary becomes a lie: callers can compose anything, so the "abstraction" guarantees nothing, and you can't tell from the interface what SQL runs.
- Behavior differs between the real provider and in-memory test doubles, so tests pass and production breaks.

Return materialized data: `IReadOnlyList<T>`, a DTO, or a page. Composition (filtering, paging, sorting) belongs *inside* the method that owns the query, parameterized explicitly:

```csharp
Task<IReadOnlyList<OrderSummary>> GetRecentAsync(
    CustomerId customerId, int page, int pageSize, CancellationToken ct);
```

---

## External services as adapters

Every external system (email, payment, blob storage, another team's API) gets a port in Application and an adapter in Infrastructure:

```csharp
// MyApp.Infrastructure/Email/SmtpEmailSender.cs
public sealed class SmtpEmailSender : IEmailSender
{
    private readonly SmtpOptions _options;

    public SmtpEmailSender(IOptions<SmtpOptions> options) => _options = options.Value;

    public Task SendAsync(Email to, string subject, string body, CancellationToken ct)
    {
        // SMTP / SendGrid / SES details stay here
    }
}
```

The adapter translates between the port's domain-shaped contract (`Email` value object) and the provider's wire format. Resilience policies (`HttpClientFactory` + Polly), credentials, and SDK types all stay on this side of the boundary.

---

## Domain event dispatching

Entities collect events (see `domain-layer.md`); Infrastructure dispatches them when saving succeeds. An EF Core `SaveChangesInterceptor` keeps this out of every handler:

```csharp
public sealed class DomainEventDispatchInterceptor : SaveChangesInterceptor
{
    private readonly IDomainEventDispatcher _dispatcher;

    public DomainEventDispatchInterceptor(IDomainEventDispatcher dispatcher) =>
        _dispatcher = dispatcher;

    public override async ValueTask<int> SavedChangesAsync(
        SaveChangesCompletedEventData eventData, int result, CancellationToken ct = default)
    {
        var context = eventData.Context;
        if (context is null) return result;

        var events = context.ChangeTracker.Entries<Entity>()
            .SelectMany(e =>
            {
                var collected = e.Entity.DomainEvents.ToList();
                e.Entity.ClearDomainEvents();
                return collected;
            })
            .ToList();

        foreach (var domainEvent in events)
            await _dispatcher.DispatchAsync(domainEvent, ct);

        return result;
    }
}
```

`IDomainEventDispatcher` resolves `IDomainEventHandler<TEvent>` implementations from DI and invokes them. Dispatching **after** save means handlers react to facts; if a handler's work must be atomic with the save or must survive a crash, use a transactional outbox instead (Wolverine has one built in).

---

## Presentation: endpoints and DTOs

Endpoints are adapters too: translate HTTP to a command/query, invoke the handler, translate the result back. No business logic, no EF.

```csharp
public static class ShipOrderEndpoint
{
    public static void Map(IEndpointRouteBuilder app) =>
        app.MapPost("/orders/{id:guid}/ship", Handle);

    private static async Task<IResult> Handle(
        Guid id,
        ICommandHandler<ShipOrderCommand, Result> handler,
        CancellationToken ct)
    {
        var result = await handler.Handle(new ShipOrderCommand(new OrderId(id)), ct);
        return result.IsSuccess ? Results.NoContent() : result.ToProblemDetails();
    }
}
```

- **Request/response contracts are Presentation types** — don't expose domain entities from endpoints (serialization couples your API shape to your domain shape, and lazy-loading surprises follow). Application's response DTOs can serve as the contract; map at the edge if the API shape diverges.
- Map `Result` failures to HTTP in **one** extension (`ToProblemDetails()`): error code → 404/409/422 with a `ProblemDetails` body. One mapping, not per-endpoint `if` chains.
- `Program.cs` is the composition root — see `solution-structure.md`. For minimal-API conventions, validation filters, and OpenAPI, defer to the `grimoire.dotnet-web-api` skill.

Sources: [DbContext as repository/UoW (Microsoft EF docs)](https://learn.microsoft.com/en-us/ef/core/) · [Implementing infrastructure persistence (Microsoft)](https://learn.microsoft.com/en-us/dotnet/architecture/microservices/microservice-ddd-cqrs-patterns/infrastructure-persistence-layer-implementation-entity-framework-core) · [Milan Jovanovic — Clean Architecture writings](https://www.milanjovanovic.tech/blog/clean-architecture-dotnet)
