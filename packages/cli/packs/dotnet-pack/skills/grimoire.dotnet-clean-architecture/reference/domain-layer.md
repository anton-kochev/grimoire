# Domain layer

Modeling business rules so they can't be bypassed. The Domain project references nothing — these patterns are plain C#.

## Contents

- [Rich vs anemic models](#rich-vs-anemic-models)
- [Entities and invariants](#entities-and-invariants)
- [Value objects](#value-objects)
- [Encapsulated collections](#encapsulated-collections)
- [Domain events](#domain-events)
- [Domain services](#domain-services)
- [Result pattern vs exceptions](#result-pattern-vs-exceptions)
- [Pragmatic EF Core concessions](#pragmatic-ef-core-concessions)

---

## Rich vs anemic models

An **anemic** model is a property bag; every rule about it lives somewhere else and can be forgotten somewhere else. A **rich** model owns its rules.

```csharp
// Anemic — the rule lives in the handler, and in every other handler that touches Status
public class Order
{
    public OrderStatus Status { get; set; }
    public List<OrderLine> Lines { get; set; } = [];
}

// handler
if (order.Lines.Count == 0) throw new InvalidOperationException("...");
order.Status = OrderStatus.Shipped;
```

```csharp
// Rich — the rule lives once, on the entity; invalid transitions are unrepresentable
public sealed class Order
{
    public OrderStatus Status { get; private set; }

    public Result Ship()
    {
        if (_lines.Count == 0)
            return Result.Failure(OrderErrors.EmptyOrderCannotShip);
        if (Status != OrderStatus.Paid)
            return Result.Failure(OrderErrors.OnlyPaidOrdersShip);

        Status = OrderStatus.Shipped;
        Raise(new OrderShippedDomainEvent(Id));
        return Result.Success();
    }
}
```

Test for anemia: if a handler reads several properties of an entity, makes a decision, and writes properties back — that decision belongs on the entity.

---

## Entities and invariants

An entity must never exist in an invalid state. Enforce that at every door:

```csharp
public sealed class Order
{
    private Order() { }                       // EF Core only — see concessions below

    private Order(CustomerId customerId)
    {
        Id = OrderId.New();
        CustomerId = customerId;
        Status = OrderStatus.Draft;
    }

    public OrderId Id { get; private set; }
    public CustomerId CustomerId { get; private set; }
    public OrderStatus Status { get; private set; }

    public static Order Create(CustomerId customerId)
    {
        ArgumentNullException.ThrowIfNull(customerId);
        return new Order(customerId);
    }
}
```

- **Private setters** — state changes only through methods that check the rules.
- **Static factory methods** — construction goes through validation; the constructor stays private.
- **Guard clauses** for programming errors (null arguments); the **result pattern** for business-rule failures (see below).
- **Strongly-typed IDs** (`OrderId`, `CustomerId` as `readonly record struct`) prevent passing a customer id where an order id is expected.

---

## Value objects

A value object models a concept whose identity *is* its value: `Money`, `Email`, `DateRange`. Records give you value equality for free; validation lives in a factory:

```csharp
public sealed record Email
{
    public string Value { get; }

    private Email(string value) => Value = value;

    public static Result<Email> Create(string? value)
    {
        if (string.IsNullOrWhiteSpace(value) || !value.Contains('@'))
            return Result.Failure<Email>(DomainErrors.InvalidEmail);
        return new Email(value.Trim().ToLowerInvariant());
    }
}
```

Why bother over a `string`: the type system now proves every `Email` in the system passed validation, and "primitive obsession" bugs (swapping two string parameters) become compile errors.

EF Core maps value objects as owned types or via conversions — that mapping lives in Infrastructure (`ComplexProperty`/`OwnsOne` or a `ValueConverter`), never as attributes on the record.

---

## Encapsulated collections

Never expose a settable `List<T>` — callers could bypass every rule about adding and removing:

```csharp
public sealed class Order
{
    private readonly List<OrderLine> _lines = [];
    public IReadOnlyCollection<OrderLine> Lines => _lines.AsReadOnly();

    public Result AddLine(ProductId productId, int quantity, Money unitPrice)
    {
        if (Status != OrderStatus.Draft)
            return Result.Failure(OrderErrors.CannotModifySubmittedOrder);

        _lines.Add(new OrderLine(Id, productId, quantity, unitPrice));
        return Result.Success();
    }
}
```

EF Core reads the backing field automatically when the property has no setter (`PropertyAccessMode.Field`).

---

## Domain events

When something happens in the domain that other parts of the system care about, raise an event instead of calling them — the aggregate stays decoupled from its consequences.

```csharp
public abstract class Entity
{
    private readonly List<IDomainEvent> _domainEvents = [];
    public IReadOnlyCollection<IDomainEvent> DomainEvents => _domainEvents.AsReadOnly();

    protected void Raise(IDomainEvent domainEvent) => _domainEvents.Add(domainEvent);
    public void ClearDomainEvents() => _domainEvents.Clear();
}

public sealed record OrderShippedDomainEvent(OrderId OrderId) : IDomainEvent;
```

The flow: the entity *raises* (collects) the event; Infrastructure *dispatches* collected events when `SaveChanges` succeeds (via an EF Core interceptor — see `infrastructure-and-presentation.md`); handlers in Application react (send the email, update the read model). Dispatching after save means events describe things that actually happened.

`IDomainEvent` is an empty marker interface defined in Domain — don't take a MediatR dependency in Domain for `INotification`.

---

## Domain services

When a rule spans multiple aggregates and belongs to none of them, use a domain service — a plain class in Domain with the logic, taking the aggregates as arguments:

```csharp
public sealed class PricingService
{
    public Money CalculateDiscount(Order order, Customer customer)
    {
        // rule that needs both Order and Customer state
    }
}
```

Use sparingly. If most logic ends up in services, the entities have gone anemic — push rules back onto whichever aggregate owns the data they read.

---

## Result pattern vs exceptions

Two kinds of failure, two mechanisms:

- **Expected business outcomes** ("order already shipped", "insufficient stock") → `Result` / `Result<T>`. These are part of the use case's contract; callers must handle them; flow control by exception is slow and invisible in signatures.
- **Bugs and broken invariants** (null argument, impossible state) → exceptions. Don't catch these in handlers; let them surface.

A minimal `Result` (or use a library like `FluentResults` or `ErrorOr`):

```csharp
public class Result
{
    protected Result(bool isSuccess, Error error) { IsSuccess = isSuccess; Error = error; }

    public bool IsSuccess { get; }
    public bool IsFailure => !IsSuccess;
    public Error Error { get; }

    public static Result Success() => new(true, Error.None);
    public static Result Failure(Error error) => new(false, error);
    public static Result<T> Failure<T>(Error error) => new(default, false, error);
}

public sealed record Error(string Code, string Message)
{
    public static readonly Error None = new(string.Empty, string.Empty);
}
```

Define errors as constants next to the aggregate (`OrderErrors.NotFound`, `OrderErrors.EmptyOrderCannotShip`) so codes are stable and discoverable. Presentation maps error codes to HTTP status codes in one place.

---

## Pragmatic EF Core concessions

Purity has a price; these concessions are conventional and contained:

- **Private parameterless constructor** on entities — EF Core materialization needs it. It's `private`, so no caller can misuse it.
- **`private set` instead of `get`-only** where EF needs to write a property.
- **No EF attributes in Domain** (`[Key]`, `[MaxLength]`, `[Table]`) — all mapping goes in `IEntityTypeConfiguration<T>` classes in Infrastructure. This is the line that must hold: Domain compiles without an EF Core reference.
- Navigation properties are fine, but prefer referencing other aggregates **by ID** (`CustomerId`, not `Customer`) — it keeps aggregate boundaries honest and avoids loading object graphs to enforce one rule.

Sources: [Clean Architecture in .NET (Milan Jovanovic)](https://www.milanjovanovic.tech/blog/clean-architecture-dotnet) · [Ardalis CleanArchitecture template](https://github.com/ardalis/cleanarchitecture) · [Microsoft — DDD-oriented microservice design](https://learn.microsoft.com/en-us/dotnet/architecture/microservices/microservice-ddd-cqrs-patterns/ddd-oriented-microservice)
