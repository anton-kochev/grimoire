# Consistency & reliability

The patterns that keep async CQRS honest: the transactional outbox, idempotency, eventual consistency as a UX contract, message versioning, and the observability that makes any of it debuggable.

## Contents

- [The outbox pattern](#the-outbox-pattern)
- [Hand-rolled outbox with EF Core](#hand-rolled-outbox-with-ef-core)
- [The buy option: Wolverine's outbox](#the-buy-option-wolverines-outbox)
- [Idempotency](#idempotency)
- [Eventual consistency is a UX problem](#eventual-consistency-is-a-ux-problem)
- [Versioning events and commands](#versioning-events-and-commands)
- [Observability for async CQRS](#observability-for-async-cqrs)

---

## The outbox pattern

The problem: a command must change the database *and* publish a message, and there is no transaction spanning both. Publish-then-commit mints phantom events when the commit fails; commit-then-publish loses events when the process dies in between. Both happen — deploys, OOM kills, and network blips guarantee it.

The outbox makes the message part of the local transaction:

```text
1. Command handler: mutate aggregate + INSERT outbox row   ── one local transaction
2. Background publisher: read unpublished rows → publish → mark published   ── separate loop
3. Consumers: process at-least-once, dedup on their side
```

Guarantees: no lost messages (the row survives the crash), no phantom messages (no commit, no row). The cost: messages are delivered *at least* once and *later* — both of which you were already signed up for the moment sync went async.

---

## Hand-rolled outbox with EF Core

Three pieces. The outbox row:

```csharp
public sealed class OutboxMessage
{
    public Guid Id { get; init; } = Guid.NewGuid();
    public DateTime OccurredAtUtc { get; init; }
    public string Type { get; init; } = null!;        // CLR type name or contract name
    public string Payload { get; init; } = null!;     // serialized event
    public DateTime? ProcessedAtUtc { get; set; }
    public int Attempts { get; set; }
    public string? Error { get; set; }
}
```

Capture — convert domain events to outbox rows inside `SaveChangesAsync` (interceptor), so no handler can forget:

```csharp
public sealed class OutboxInterceptor : SaveChangesInterceptor
{
    public override ValueTask<InterceptionResult<int>> SavingChangesAsync(
        DbContextEventData eventData, InterceptionResult<int> result, CancellationToken ct = default)
    {
        var db = eventData.Context!;
        var messages = db.ChangeTracker.Entries<Entity>()
            .SelectMany(e => e.Entity.DequeueDomainEvents())
            .Select(domainEvent => new OutboxMessage
            {
                OccurredAtUtc = DateTime.UtcNow,
                Type = domainEvent.GetType().AssemblyQualifiedName!,
                Payload = JsonSerializer.Serialize(domainEvent, domainEvent.GetType()),
            });
        db.Set<OutboxMessage>().AddRange(messages);   // same transaction as the aggregate change
        return base.SavingChangesAsync(eventData, result, ct);
    }
}
```

Publish — a `BackgroundService` polls, publishes, marks:

```csharp
protected override async Task ExecuteAsync(CancellationToken ct)
{
    while (!ct.IsCancellationRequested)
    {
        var batch = await _db.Set<OutboxMessage>()
            .Where(m => m.ProcessedAtUtc == null && m.Attempts < MaxAttempts)
            .OrderBy(m => m.OccurredAtUtc)
            .Take(50)
            .ToListAsync(ct);

        foreach (var message in batch)
        {
            try
            {
                await _publisher.PublishAsync(message.Type, message.Payload, ct);
                message.ProcessedAtUtc = DateTime.UtcNow;
            }
            catch (Exception ex)
            {
                message.Attempts++;
                message.Error = ex.Message;          // poison after MaxAttempts → alert + manual queue
            }
        }
        await _db.SaveChangesAsync(ct);
        await Task.Delay(_pollInterval, ct);
    }
}
```

Production notes the sketch omits: row locking (`FOR UPDATE SKIP LOCKED` via raw SQL) when running multiple publisher instances; a retention/cleanup job for processed rows; exponential backoff per message; and a dead-letter decision for poisoned rows. None of it is hard; all of it is *your* pager when hand-rolled — which is the segue to the buy option.

---

## The buy option: Wolverine's outbox

Wolverine ships a durable transactional outbox (and inbox) for EF Core and Marten. With `AutoApplyTransactions` + durable endpoints, any message published from a handler is persisted with the transaction and relayed by Wolverine's durability agent — retries, backoff, multi-node leadership, and dead-lettering included:

```csharp
builder.Host.UseWolverine(opts =>
{
    opts.PublishMessage<OrderPlaced>().ToRabbitQueue("orders").UseDurableOutbox();
    opts.UseEntityFrameworkCoreTransactions();
    opts.Policies.AutoApplyTransactions();
    opts.Policies.UseDurableLocalQueues();
});
```

Hand-roll when the outbox is your only async need and dependencies are tightly budgeted; buy when projections, retries, and consumer dedup are also on the menu — they arrive in the same box.

---

## Idempotency

At-least-once delivery and client retries make duplicates a *when*, not an *if*. Defenses by location:

**Command boundary (client-facing).** The client sends a unique key per logical operation (`Idempotency-Key` header or a `CommandId` in the payload). Before side effects, check a processed-commands store; on a hit, return the recorded result instead of re-executing. The dedup row commits in the same transaction as the work — a separate cache (Redis) reintroduces the two-store race the outbox just solved.

**Consumer side (projections, integrations).** Three escalating options:

| Strategy | How | When |
|---|---|---|
| Natural idempotency | Upserts keyed by entity ID; `Status = Shipped` twice is harmless | Most projections — design for this first |
| Position tracking | Store last applied event position per projection; skip ≤ it | Accumulating projections (counters, totals) |
| Inbox table | Record processed message IDs transactionally with the work; skip on replay | Side-effecting consumers (emails, payment calls) |

**Idempotent by design beats idempotent by bookkeeping.** `AddLoyaltyPoints(50)` needs an inbox; `SetLoyaltyPoints(150, version: 7)` needs nothing. When you control the contract, prefer absolute-state messages with versions over relative deltas.

---

## Eventual consistency is a UX problem

Users don't experience replication lag; they experience "I clicked save and it's not there." Treat consistency as a product decision made per screen, not an infrastructure fact to apologize for.

| Pattern | What the user sees | Cost |
|---|---|---|
| **Read-your-own-writes** (detail-by-ID from write store) | Their action, immediately, always | Routing convention — cheapest, do this first (see `read-models-and-projections.md`) |
| **Optimistic UI** | Instant success; rollback with apology on rare failure | Client-side state management |
| **Pending states** | "Processing…" badge that resolves via polling/SSE/WebSocket | Honest for genuinely async work (payments, provisioning) |
| **Refresh affordance** | Stale list + a way to update it | Nearly free; fine for low-stakes dashboards |
| **Blocking confirmation** | Spinner until the read model catches up | Latency; reserve for high-stakes flows that must not show stale state |

Two rules that prevent most incidents:

1. **Classify every query** as may-be-stale or must-be-current at design time, and route accordingly. The bug is never the lag itself; it's a must-be-current screen accidentally served by an eventually-consistent store.
2. **Commands answer immediately even when fulfillment is async.** Accept, validate, return the ID and a state (`Accepted`/`Processing`) — the user gets certainty that the *intent* landed, while the outcome streams in.

---

## Versioning events and commands

Published messages are a contract with every consumer — including the projection you'll rebuild in two years against events written today. Strategies, cheapest first:

1. **Additive-only changes.** New optional fields with sensible defaults; tolerant readers (`JsonSerializerOptions` ignoring unknowns, no required-field explosions). Handles the large majority of evolution.
2. **Upcasting.** Keep one current shape in code; transform old payloads on read (`OrderPlacedV1 → OrderPlacedV2`) in a deserialization layer. Consumers and projections see only the latest version. Marten supports this natively; hand-rolled, it's a registry of `(type, version) → transform` functions.
3. **New message type.** Breaking semantic change → new contract (`OrderPlacedV2` or a renamed event), with both handled during the migration window. Explicit, verbose, unavoidable when meaning (not just shape) changed.

Rules regardless of strategy: never mutate or delete persisted events (append a compensating event instead); version the *contract*, not the class file; and test deserialization of historical payloads in CI — a frozen-fixture test per published version catches the accidental break before the rebuild does.

Commands version more easily (one consumer, short-lived), but public command APIs deserve the same additive-first discipline.

---

## Observability for async CQRS

The async failure mode is silence: writes succeed, the read side quietly stops, and discovery is a customer asking why yesterday's orders are missing. Non-negotiables before the first async projection ships:

- **Correlation IDs end to end.** Command ID flows into outbox rows, message headers, consumer logs, and projection writes — one ID traces a user action through every hop. `System.Diagnostics.Activity` (W3C trace context) gives this nearly free with OpenTelemetry.
- **Projection lag as a first-class metric.** `now − OccurredAtUtc` of the newest unprocessed outbox row, and per-projection applied-position vs head. Alert on threshold; graph it always. Lag trending up is the only early warning you get.
- **Dead-letter queues with an owner.** Poisoned messages go to a DLQ with the error attached — and a human is paged, because a DLQ nobody drains is a slow-motion data loss. Every DLQ entry is a read model missing a fact.
- **Outbox depth and age.** Unpublished-row count and oldest-row age catch a dead publisher in seconds.
- **Rebuild as a drill, not a theory.** If projections are rebuildable (they must be — see `read-models-and-projections.md`), rebuild one on purpose periodically. An unrehearsed recovery path doesn't exist.

Sources: [Transactional outbox (microservices.io)](https://microservices.io/patterns/data/transactional-outbox.html) · [Wolverine durable messaging](https://wolverinefx.net/guide/durability/) · [Idempotent consumer (microservices.io)](https://microservices.io/patterns/communication-style/idempotent-consumer.html) · [Eventual consistency UX (Derek Comartin)](https://codeopinion.com/eventual-consistency-is-a-ux-nightmare/) · [Event versioning (Greg Young, Versioning in an Event Sourced System)](https://leanpub.com/esversioning)
