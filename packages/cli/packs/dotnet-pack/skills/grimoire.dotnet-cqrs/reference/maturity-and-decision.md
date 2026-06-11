# The CQRS maturity ladder & decision framework

When each level of CQRS pays off, what graduation pain actually looks like, and the myths that push teams up the ladder too early.

## Contents

- [Level 1 — handler split, one model, one database](#level-1--handler-split-one-model-one-database)
- [Level 2 — separate read models, same database](#level-2--separate-read-models-same-database)
- [Level 3 — separate stores, async synchronization](#level-3--separate-stores-async-synchronization)
- [Level 4 — event sourcing and projections](#level-4--event-sourcing-and-projections)
- [Graduation triggers: what real pain looks like](#graduation-triggers-what-real-pain-looks-like)
- [The decision framework](#the-decision-framework)
- [Myths, expanded](#myths-expanded)
- [Anti-patterns that climb the ladder for you](#anti-patterns-that-climb-the-ladder-for-you)

---

## Level 1 — handler split, one model, one database

Commands and queries are separate handler classes in one process against one database. Commands load aggregates and go through the domain; queries project straight to DTOs with EF `.Select()` or Dapper. The complete setup (handler interfaces, DI registration, decorators) is in `grimoire.dotnet-clean-architecture`, `reference/application-layer.md`.

What Level 1 already buys you:

- **Asymmetric optimization** — queries skip change tracking, aggregate hydration, and domain mapping.
- **Clear units of change** — one use case, one class, one test target.
- **A future** — every higher level starts from this shape; nothing is thrown away when you climb.

Cost: near zero. There is no infrastructure, no consistency model to explain, no new failure modes. **Most systems should stop here permanently.** Treat staying at Level 1 as a success, not a compromise.

---

## Level 2 — separate read models, same database

The read side gets its own *persistent shape*: denormalized read tables, database views (indexed/materialized where the engine supports it), or summary tables — still in the same database, still updated **in the same transaction** as the write.

```csharp
public async Task<Result> Handle(ShipOrderCommand cmd, CancellationToken ct)
{
    var order = await _db.Orders.FirstOrDefaultAsync(o => o.Id == cmd.OrderId, ct);
    if (order is null) return Result.Failure(OrderErrors.NotFound);

    var result = order.Ship();
    if (result.IsFailure) return result;

    // maintain the denormalized read row in the same transaction — synchronous CQRS
    var summary = await _db.OrderSummaries.FirstAsync(s => s.OrderId == cmd.OrderId.Value, ct);
    summary.Status = "Shipped";
    summary.ShippedAtUtc = _clock.UtcNow;

    await _db.SaveChangesAsync(ct);   // both shapes commit atomically
    return Result.Success();
}
```

Strong consistency is preserved — there is no lag, no outbox, no projection daemon. The price is write amplification (every command also touches its read rows) and the discipline to keep read tables rebuildable from the write side.

Level 2 is cheap, reversible, and solves the most common real complaint ("our list screens are slow and ugly to query"). Exhaust it before considering Level 3.

---

## Level 3 — separate stores, async synchronization

The read side moves to different infrastructure: a read replica, Elasticsearch for search, Redis for hot lookups, a document store for screen-shaped documents. Synchronization becomes asynchronous: the write transaction commits an outbox row, a background publisher emits the event, a projection consumer updates the read store.

What you must already have before going here:

- **Outbox pattern** on the write side — there is no distributed transaction across stores (see `consistency-and-reliability.md`).
- **Idempotent projections** — at-least-once delivery means every consumer sees duplicates eventually.
- **Observability** — correlation IDs, projection-lag metrics, dead-letter queues. An async CQRS bug without these is invisible: writes succeed, reads silently serve stale data, and nobody knows until a customer does.
- **A UX answer for lag** — read-your-own-writes, optimistic UI, or explicit "processing" states (see `consistency-and-reliability.md`).

The payoffs are real where the signals are real: each side scales independently, and the read store can be a technology actually built for the query (full-text search, graph traversal, sub-millisecond key lookup).

---

## Level 4 — event sourcing and projections

The write model stops storing current state: every change is an immutable event appended to a stream, and *all* state — including the aggregates themselves — is a projection over events. In .NET this is Marten territory (see `event-sourcing-marten.md`).

Level 4 is not "more CQRS"; it is a different persistence philosophy that happens to produce CQRS naturally. Go here when the **event history itself is a business requirement**: regulatory audit, temporal queries ("what did this account look like on March 3rd"), domains where the sequence of changes carries meaning (trading, logistics, claims processing). Do not go here for an audit *log* — a history table or temporal tables (`SYSTEM_VERSIONING`) deliver that at a fraction of the cost.

---

## Graduation triggers: what real pain looks like

| You're at | Real trigger to climb | Not a trigger |
|---|---|---|
| Level 1 → 2 | List/report queries need 6+ joins and still miss the shape; read DTOs are contortions over aggregates; query performance work keeps fighting the normalized schema | "Denormalized would be cleaner"; one slow query an index would fix |
| Level 2 → 3 | Measured read load that the write database demonstrably can't serve even with views and replicas; a query *capability* gap (full-text, geo, faceting) | Anticipated scale; resume-driven architecture; "microservices do it this way" |
| Level 3 → 4 | Audit/temporal access is a stated business requirement; the domain's value lives in its history; rebuildable projections from a canonical log would replace bespoke sync code you already maintain | Wanting an audit log; event-driven integration (you can publish events without sourcing from them) |

Two honest checks before any climb:

1. **Can you name the failing metric?** A latency number, a contention incident, a requirement document. If the justification is adjectives ("more scalable", "cleaner"), stay put.
2. **Have you exhausted the current level?** Indexes, compiled queries, `.AsNoTracking()`, views, and a read replica all come before "second store".

---

## The decision framework

Score the **bounded context**, not the system. A product catalog and an order-fulfillment workflow in the same solution can legitimately sit on different rungs.

| Factor | Points toward CQRS | Points away |
|---|---|---|
| Domain complexity | Write rules and read shapes genuinely diverge | Read and write are the same rows with the same shape |
| Read/write ratio | Heavily read-dominant, or the inverse, at meaningful scale | Balanced and modest |
| Concurrency | Many collaborating writers, contention, conflict resolution | Single writer per record in practice |
| Audit | Change history is a requirement | A `ModifiedAtUtc` column satisfies everyone |
| Team | Multiple teams own read vs write concerns | One team, one codebase, one deploy |
| Ops maturity | Tracing, metrics, DLQs exist and are watched | "We check the logs when something breaks" |

Fowler's warning deserves its full weight: he reports that **most** systems he encountered that adopted CQRS as a general architecture suffered for it, and that CQRS is a useful pattern **for a minority of bounded contexts**. The Azure Architecture Center says the same thing more politely: deploy it selectively, where collaborative load or model divergence justifies it.

---

## Myths, expanded

**"CQRS means event sourcing."** They are orthogonal. CQRS splits responsibility; ES changes what you persist. ES *implies* a CQRS-like read path (projections) but the reverse does not hold — Levels 1–3 have no event store. Teams that conflate them price CQRS at Level 4 cost and reject it, losing the cheap wins of Levels 1–2.

**"CQRS means two databases."** The pattern is about models and responsibility, not deployment. One database with two shapes (Level 2) is full, legitimate CQRS — and synchronous.

**"CQRS means a message bus."** Messaging enters only when synchronization goes async (Level 3). In-process, in-transaction CQRS needs no broker, and adding one "for the pattern" buys failure modes with no payoff.

**"CQRS means eventual consistency."** Only async sync produces lag. Levels 1–2 are strongly consistent. Eventual consistency is a *choice* you make at Level 3 because the payoff justifies it — never an obligation the pattern imposes.

---

## Anti-patterns that climb the ladder for you

**CQRS everywhere.** A blanket "all features use commands/queries/buses" decree turns the 20% of contexts that benefit into hostages of the 80% that don't. Symptoms: CRUD endpoints with five ceremony files each; developers routing around the architecture to ship.

**Generic handler base classes.** `BaseCommandHandler<T>` with template methods (`PreValidate`, `ExecuteCore`, `PostProcess`) recreates the worst of inheritance to solve what decorators already solve compositionally. Cross-cutting behavior belongs in decorators or Wolverine middleware — see the decorator section of `grimoire.dotnet-clean-architecture`.

**Distributed-transaction assumptions.** Code that writes the order to SQL and the read document to Mongo "in one go" and assumes both happened. There is no ambient transaction across stores; without an outbox, every deploy, crash, and timeout mints inconsistencies. If you find `TransactionScope` stretched across heterogeneous stores, that's the bug.

**Premature Level 3.** Two databases on day one, before any measured pain, doubles the operational surface (two backup stories, two scaling stories, one new consistency story) for a load profile that a single Postgres instance would have yawned at.

Sources: [CQRS (Martin Fowler)](https://martinfowler.com/bliki/CQRS.html) · [CQRS pattern (Microsoft Azure Architecture Center)](https://learn.microsoft.com/en-us/azure/architecture/patterns/cqrs) · [CQRS facts and myths (Oskar Dudycz)](https://event-driven.io/en/cqrs_facts_and_myths_explained/) · [CQRS pattern (microservices.io)](https://microservices.io/patterns/data/cqrs.html)
