# Read models & projections

Designing the read side: models shaped by consumers, Level 2 techniques inside one database, Level 3 projections across stores, and keeping users from noticing any of it.

## Contents

- [Read models are shaped by the screen](#read-models-are-shaped-by-the-screen)
- [Level 2: read shapes inside one database](#level-2-read-shapes-inside-one-database)
- [Level 3: projections across stores](#level-3-projections-across-stores)
- [Rebuildability is the safety property](#rebuildability-is-the-safety-property)
- [Read-your-own-writes](#read-your-own-writes)
- [Anti-patterns on the read side](#anti-patterns-on-the-read-side)

---

## Read models are shaped by the screen

A write model answers "what must be true for this change to be valid." A read model answers one consumer's question, pre-chewed. Design read models backwards from the consumer:

- **One read model per question**, not per entity. `OrderDetailsResponse`, `OrderListItem`, and `MonthlyRevenueRow` can all derive from `Order` and share nothing.
- **Denormalize without guilt.** Customer name copied into the order summary row is correct read-side design, not a normalization failure — the write side owns truth, the read side owns convenience.
- **Flat beats clever.** A read model is ideally `SELECT`-shaped: scalar properties, pre-computed totals, display-ready strings. If consumers must post-process it, the model answered the wrong question.
- **No behavior.** Read models are records with data. Logic on a read model is either presentation (move to the consumer) or business rules (already in the domain — don't fork them).

```csharp
// shaped by the order list screen — nothing more
public sealed record OrderListItem(
    Guid Id,
    string OrderNumber,
    string CustomerName,     // denormalized — no join at read time
    string Status,
    decimal Total,           // pre-computed at write/projection time
    DateTime PlacedAtUtc);
```

---

## Level 2: read shapes inside one database

All of these keep strong consistency — the read shape is maintained in the write transaction or computed at query time.

**EF `.Select()` projections** — the workhorse. Project entities straight to response types; EF translates to SQL touching only the needed columns, with no tracking and no aggregate hydration:

```csharp
public Task<List<OrderListItem>> Handle(ListOrdersQuery q, CancellationToken ct) =>
    _db.Orders
        .Where(o => o.CustomerId == q.CustomerId)
        .OrderByDescending(o => o.PlacedAtUtc)
        .Select(o => new OrderListItem(o.Id.Value, o.Number.Value, o.Customer.Name,
            o.Status.ToString(), o.Lines.Sum(l => l.UnitPrice.Amount * l.Quantity), o.PlacedAtUtc))
        .Take(q.PageSize)
        .ToListAsync(ct);
```

**Dapper for the gnarly ones.** When the query is reporting-shaped (CTEs, window functions, `GROUP BY` pyramids), write the SQL and map to the read model directly. A CQRS query handler is precisely the place where raw SQL is idiomatic, because no invariants are at risk on a read.

**Database views.** A view per screen formalizes the read shape in the database, queryable by EF (keyless entity types) or Dapper. Indexed/materialized views push the computation to write time — the database maintains your denormalization for you, transactionally.

**Denormalized read tables.** When views can't express it (cross-aggregate summaries, computed state), maintain a read table in the command handler's transaction — shown in `maturity-and-decision.md`. The handler updates both shapes; `SaveChangesAsync` commits both or neither. Alternative wiring: handle a domain event in the same transaction (an in-process event handler that runs before `SaveChanges` completes), keeping the command handler unaware of which read models exist.

Choose by maintenance cost: `.Select()` until queries get ugly, views when the database can own the shape, read tables when state must be accumulated.

---

## Level 3: projections across stores

At Level 3 a **projection** is a consumer that folds events (or change records) from the write side into a read store. The shape:

```text
command handler ──► write DB + outbox row     (one transaction)
outbox publisher ──► broker                    (at-least-once)
projection consumer ──► read store             (idempotent upsert)
```

Rules that keep projections sane:

- **Idempotent by construction.** At-least-once delivery guarantees duplicates. Upserts keyed by entity ID handle most cases; for accumulating projections (counters, running totals) track the last applied event position per projection and skip already-applied events.
- **Ordering is per-stream, not global.** Brokers guarantee order per partition/stream at best. Key the partition by aggregate ID so each entity's events arrive in order; never assume cross-entity ordering.
- **Out-of-order tolerance.** Where ordering can't be guaranteed, version-stamp read rows and ignore older versions on write (`WHERE Version < @incoming`).
- **Projection state is disposable.** The read store can be wiped and rebuilt — which is the property that makes schema changes on the read side boring instead of terrifying.
- **One projector per read model.** A consumer that updates the search index *and* the cache *and* the summary table couples their failure modes and rebuild schedules.

**Rebuilders.** Every Level 3 projection needs a rebuild path: a batch job that replays the source of truth (write tables or event log) through the same folding logic into a fresh read store, then swaps. Build it with the projection, not after the first incident — it is also your recovery story for poisoned projections and your migration story for read-schema changes. (At Level 4 this comes free: Marten's projection rebuild — see `event-sourcing-marten.md`.)

---

## Rebuildability is the safety property

The invariant across every level: **a read model must never be the only home of a fact.** Everything in a read store must be derivable from the write side (or the event log) at any time.

The moment a projection writes data that exists nowhere else — a flag set by a consumer, a value computed from a since-lost message — rebuild becomes impossible and the read store silently graduates into a second source of truth. Now there are two, they disagree, and which one is right depends on who you ask.

Audit this when reviewing read-side code: every column in every read table should trace to write-side data plus deterministic computation. If an operator edits read rows by hand to "fix" data, that's the alarm bell — the fix belongs on the write side, flowing through the projection.

---

## Read-your-own-writes

The classic eventual-consistency embarrassment: the user creates an order, lands on the order list, and their order isn't there. Stale *lists* are forgivable; losing *the user's own action* is not. Techniques, cheapest first:

1. **Query by ID hits the write store.** The post-command redirect (`201` + `Location`) fetches the detail view by ID — serve that query from the write database, which is always current. Only lists and searches ride the eventually-consistent read store. This single convention eliminates most of the problem.
2. **Optimistic UI.** The client already has everything it submitted; render the new item locally and reconcile when the read side catches up. The standard pattern in SPAs — works with no server-side machinery.
3. **Version-aware reads.** The command returns the new version/position; the client passes it on the next query; the read side serves only if its projection has reached that position (wait briefly or fall back to the write store). Heavier — reserve for workflows where stale reads cause real harm.
4. **Session pinning.** For a short window after a write, route that user's reads to the write store (or replica primary). Simple to reason about, needs sticky routing infrastructure.

What does *not* work: pretending the lag isn't there. Decide per query who may be stale and for how long; encode it, don't hope.

---

## Anti-patterns on the read side

**Leaky read models.** Domain entities or value objects serialized into responses. Every screen now depends on the domain's shape, refactoring the aggregate breaks API contracts, and lazy-loading surprises ship to production. Read models are dedicated types; the boundary between domain and response is load-bearing.

**The reused read model.** One `OrderDto` serving the list screen, the detail screen, the admin export, and the mobile API — fifteen nullable properties, each consumer using six. Per-question models cost a few records; the all-purpose DTO costs every consumer paying for every other consumer's needs forever.

**Bloated query handlers.** A query handler that loads aggregates, calls domain methods, and maps through three layers to produce a DTO has missed the point of the split — reads take the shortest path. Conversely, a query handler making *decisions* (filtering by business rules duplicated from the domain) is a write-side rule leaking right.

**Cache-as-read-model without an invalidation story.** Redis-cached query results are a read model — and the projection updating them is whatever invalidation you remembered to write. Treat caches with projection discipline (keyed, idempotent, rebuildable) or accept that they will lie.

Sources: [CQRS pattern (Microsoft Azure Architecture Center)](https://learn.microsoft.com/en-us/azure/architecture/patterns/cqrs) · [Materialized View pattern (Microsoft)](https://learn.microsoft.com/en-us/azure/architecture/patterns/materialized-view) · [Projections in event sourcing (Oskar Dudycz)](https://event-driven.io/en/projections_and_read_models_in_event_driven_architecture/) · [CodeOpinion — CQRS & read models (Derek Comartin)](https://codeopinion.com/)
