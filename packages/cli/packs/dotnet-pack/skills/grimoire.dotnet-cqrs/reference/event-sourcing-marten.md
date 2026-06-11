# Event sourcing with Marten

Level 4 of the CQRS ladder: events as the source of truth, Marten as the .NET event store, projections as the read side, and the critter stack.

## Contents

- [When Level 4 actually pays](#when-level-4-actually-pays)
- [Marten basics: streams, append, aggregate](#marten-basics-streams-append-aggregate)
- [The decider shape: pure domain, thin handler](#the-decider-shape-pure-domain-thin-handler)
- [Projections: live, inline, async](#projections-live-inline-async)
- [Snapshots and rebuilds](#snapshots-and-rebuilds)
- [The critter stack: Marten + Wolverine](#the-critter-stack-marten--wolverine)
- [Scope it: event sourcing per bounded context](#scope-it-event-sourcing-per-bounded-context)

---

## When Level 4 actually pays

Event sourcing stores *what happened* instead of *what is*. State — including the aggregate used to validate commands — is computed by folding events. That buys:

- **Audit as a property, not a feature.** The history *is* the data; it can't drift from reality the way a bolted-on audit table can.
- **Temporal queries.** "What did this policy look like when the claim was filed" is a fold up to a timestamp, not an archaeology project.
- **Retroactive read models.** A report nobody imagined at design time can be projected over years of existing events.
- **Domains where the sequence carries meaning** — trading, claims, logistics, anything where *how you got here* is a business question.

What it costs: a different mental model for the whole team (folds, projections, immutability), versioning discipline from day one (see `consistency-and-reliability.md` — historical events never go away), and read models that are all projections with everything that implies.

Don't event-source for: an audit *log* (temporal tables are 10× cheaper), event-driven *integration* (you can publish events from a state-stored system via the outbox), or because it pairs nicely with CQRS in diagrams. The escape hatch in both directions: per bounded context, never all-or-nothing.

---

## Marten basics: streams, append, aggregate

Marten turns Postgres into a document database *and* event store — real ACID transactions, no new infrastructure beyond the Postgres you likely run anyway. Events live in **streams**, one stream per aggregate instance:

```csharp
// events are plain records — past tense, business vocabulary
public sealed record OrderPlaced(Guid OrderId, Guid CustomerId, decimal Total);
public sealed record OrderLineAdded(Guid OrderId, string Sku, int Quantity, decimal UnitPrice);
public sealed record OrderShipped(Guid OrderId, DateTime ShippedAtUtc);

// start a stream
public async Task<Guid> Handle(PlaceOrder cmd, IDocumentSession session, CancellationToken ct)
{
    var orderId = Guid.NewGuid();
    session.Events.StartStream<Order>(orderId,
        new OrderPlaced(orderId, cmd.CustomerId, cmd.Total));
    await session.SaveChangesAsync(ct);   // transactional append
    return orderId;
}
```

The write-side aggregate is a fold over its stream — Marten conventionally applies events to an aggregate class:

```csharp
public sealed class Order
{
    public Guid Id { get; private set; }
    public OrderStatus Status { get; private set; }
    public decimal Total { get; private set; }

    public void Apply(OrderPlaced e)  { Id = e.OrderId; Status = OrderStatus.Placed; Total = e.Total; }
    public void Apply(OrderShipped e) { Status = OrderStatus.Shipped; }
}

// load current state by folding the stream
var order = await session.Events.AggregateStreamAsync<Order>(orderId, token: ct);
```

Appends carry expected-version checks, giving optimistic concurrency per stream: two commands racing on the same order conflict at commit instead of silently interleaving.

---

## The decider shape: pure domain, thin handler

The idiomatic command handler at Level 4: load state by folding, **decide** (pure function from state + command to events), append. Business rules live in the decision; persistence is an append:

```csharp
public static class ShipOrderHandler
{
    public static async Task<Result> Handle(ShipOrder cmd, IDocumentSession session, CancellationToken ct)
    {
        var order = await session.Events.AggregateStreamAsync<Order>(cmd.OrderId, token: ct);
        if (order is null) return Result.Failure(OrderErrors.NotFound);

        if (order.Status != OrderStatus.Paid)                 // the decision — pure, unit-testable
            return Result.Failure(OrderErrors.OnlyPaidOrdersShip);

        session.Events.Append(cmd.OrderId, new OrderShipped(cmd.OrderId, DateTime.UtcNow));
        await session.SaveChangesAsync(ct);
        return Result.Success();
    }
}
```

Testing collapses to given-events / when-command / then-events — no mocks, no database: fold the givens, run the decision, assert the emitted events.

---

## Projections: live, inline, async

Every read model is a projection over events. Marten gives three lifecycles — choosing per projection is the Level 4 version of the consistency decisions in `consistency-and-reliability.md`:

| Lifecycle | When it runs | Consistency | Use for |
|---|---|---|---|
| **Live** | Folded on demand at query time | Always current | Single-stream views, low read volume — the write-side aggregate itself |
| **Inline** | Same transaction as the append | Strongly consistent | Read models that must never lag — the read-your-own-writes screens |
| **Async** | Background daemon tails the event log | Eventually consistent | Cross-stream aggregations, search feeds, anything expensive |

```csharp
// a multi-stream async projection: revenue per customer
public sealed class CustomerRevenueProjection : MultiStreamProjection<CustomerRevenue, Guid>
{
    public CustomerRevenueProjection()
    {
        Identity<OrderPlaced>(e => e.CustomerId);
    }

    public void Apply(OrderPlaced e, CustomerRevenue view) => view.Total += e.Total;
}

// registration
builder.Services.AddMarten(opts =>
{
    opts.Connection(connectionString);
    opts.Projections.Snapshot<Order>(SnapshotLifecycle.Inline);          // write-side state
    opts.Projections.Add<CustomerRevenueProjection>(ProjectionLifecycle.Async);
}).AddAsyncDaemon(DaemonMode.HotCold);   // clustered: one node runs the daemon, others stand by
```

Inline projections make Marten unusually forgiving for teams entering Level 4: the high-stakes screens stay strongly consistent inside Postgres transactions, and only the genuinely expensive views pay the eventual-consistency tax.

---

## Snapshots and rebuilds

**Snapshots** are a performance optimization, not an architecture: when streams grow long (thousands of events), persist the folded aggregate periodically and fold only the tail. Marten's `Snapshot`/`SnapshotLifecycle` handles it declaratively. Don't snapshot until `AggregateStreamAsync` actually shows up in a profile — short streams (the common case when aggregates are scoped well) never need it.

**Rebuilds** are the killer feature. Because events are the truth, any projection can be deleted and recomputed:

```bash
# rebuild a projection from event #0 — also available via IProjectionCoordinator in code
dotnet run -- projections rebuild CustomerRevenueProjection
```

This is what makes read-side schema changes boring at Level 4: change the projection code, rebuild, done. No migration scripts against derived data, no backfill jobs. It is also the recovery path for projection bugs — fix the fold, replay history, and the read model is as if the bug never existed. Rehearse it (see the observability section of `consistency-and-reliability.md`); rebuild time grows with history, and partitioning/archiving old streams is the long-term lever.

The discipline that keeps rebuilds possible: projections must be deterministic functions of events. A projection that calls an external service or reads the clock bakes unreproducible data into the read model — pass such values in *on the event* at write time instead.

---

## The critter stack: Marten + Wolverine

Marten and Wolverine are siblings (JasperFx) and integrate beyond what either does alone — the combination is the most complete OSS CQRS/ES stack in .NET:

```csharp
builder.Services.AddMarten(opts => { /* … */ })
    .IntegrateWithWolverine();        // Marten outbox + Wolverine transport

builder.Host.UseWolverine(opts =>
{
    opts.Policies.AutoApplyTransactions();
    opts.Policies.UseDurableLocalQueues();
});
```

What the integration buys:

- **Transactional outbox over the event store** — events appended and messages published in one Postgres transaction (`IntegrateWithWolverine`), the hand-rolled machinery from `consistency-and-reliability.md` for free.
- **Event subscriptions** — Wolverine relays selected Marten events to handlers or external transports (Rabbit, Azure Service Bus, Kafka), so other bounded contexts integrate without touching the event store.
- **The aggregate handler workflow** — `[AggregateHandler]` collapses the decider shape: Wolverine loads the aggregate, your handler returns events, Wolverine appends and commits. The handler body is *only* the decision.

```csharp
[AggregateHandler]
public static IEnumerable<object> Handle(ShipOrder cmd, Order order)   // Wolverine folds Order for you
{
    if (order.Status != OrderStatus.Paid)
        throw new InvalidOrderStateException(OrderErrors.OnlyPaidOrdersShip);
    yield return new OrderShipped(cmd.OrderId, DateTime.UtcNow);
}
```

---

## Scope it: event sourcing per bounded context

The sustainable shape in a real system: event-source the contexts whose history is the product (the order lifecycle, the claim, the trade) and state-store the rest (the product catalog, user preferences, reference data). Marten supports this natively — its document store and event store share a database and a transaction, so a single command can append to a sourced stream *and* update a plain document atomically.

Signals you've over-scoped: streams for data with no meaningful history (a `CustomerEmailChanged` stream with one event per year), projections that exist only to make sourced data look like the CRUD table everyone actually wanted, and versioning toil on events nobody replays. Demote those contexts to documents; keep the events where the history earns its rent.

Sources: [Marten event store docs](https://martendb.io/events/) · [Marten projections](https://martendb.io/events/projections/) · [Wolverine + Marten integration](https://wolverinefx.net/guide/durability/marten/) · [Event sourcing (Oskar Dudycz, event-driven.io)](https://event-driven.io/en/) · [CQRS Documents (Greg Young)](https://cqrs.files.wordpress.com/2010/11/cqrs_documents.pdf)
