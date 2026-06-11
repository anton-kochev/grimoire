---
name: grimoire.dotnet-cqrs
description: "Tactical CQRS for modern .NET (current: .NET 10) — the maturity ladder from in-process command/query handler split to separate read/write models, separate stores, and event sourcing with Marten, with a decision framework for when each level pays off and when CQRS is overkill. Covers the 2025+ dispatch landscape (Wolverine, Cortex.Mediator, Brighter, FastEndpoints, plain handlers as MediatR alternatives), read model and projection design, the transactional outbox with EF Core, idempotency keys, eventual consistency as a UX problem (read-your-own-writes, optimistic UI), event versioning, returning data from commands, and vertical slice pairing. Use when designing command handlers, query handlers, read models, projections, or async consistency between write and read sides. Triggers: CQRS, command query separation, command handler, query handler, read model, write model, projection, event sourcing, Marten, Wolverine, MediatR alternative, outbox, eventual consistency, idempotency, vertical slice, critter stack."
---

# CQRS for .NET

How to apply CQRS on modern .NET beyond the basic handler split. Examples target **.NET 10** and the current (2026) ecosystem. This skill builds on `grimoire.dotnet-clean-architecture` — the command/query handler basics, plain-handler dispatch with DI, decorator pipelines, and validation placement live there and are not repeated here. This skill covers what comes next: when (and whether) to escalate, read model and projection design, consistency and reliability patterns, and event sourcing with Marten.

The single most important rule: **CQRS is a ladder, and most systems should stay on the bottom rung.**

## The CQRS maturity ladder

| Level | What it is | Storage | Move up when |
|---|---|---|---|
| **1 — Handler split** | Separate command and query handlers in one process; queries project straight to DTOs | One database, one model | This is the default — most systems never need more |
| **2 — Separate read models** | Dedicated denormalized read tables or database views, maintained in the same transaction as the write | One database, two shapes | Queries fight the write schema: N-join aggregations, list screens timing out, read DTOs contorted around aggregates |
| **3 — Separate stores** | Write database + purpose-built read store (e.g. SQL → Elastic/Redis/replica), synced asynchronously | Two stores, eventual consistency | Proven scale asymmetry or a read technology need one database can't serve — requires outbox + observability |
| **4 — Event sourcing** | Events are the source of truth; state and read models are projections (Marten on Postgres) | Event store + projections | Audit trail is a *requirement* (not a nice-to-have), temporal queries, complex state-transition domains |

**Graduate only on demonstrated pain.** Each level multiplies operational cost; none of them can be justified by "we might need it later." Level 1→2 is cheap and reversible. Level 2→3 is an infrastructure commitment. Level 3→4 changes how the team thinks about data.

→ Deep dive (levels in .NET-concrete detail, graduation triggers): **[reference/maturity-and-decision.md](reference/maturity-and-decision.md)**

## Should you use CQRS here?

Decide per **bounded context**, never system-wide. Fowler's field report stands: most systems he saw adopt CQRS broadly hit serious difficulties — it's a minority pattern that pays off in specific places.

| Signal | Verdict |
|---|---|
| Complex domain where read and write shapes genuinely differ | CQRS pays — the models were never the same thing |
| Heavy read/write asymmetry (read-mostly at scale) | CQRS pays — scale and optimize each side independently |
| Collaborative domain, many writers, contention | CQRS pays — intent-based commands reduce conflicts |
| Audit/event history is a business requirement | CQRS pays — and consider Level 4 |
| CRUD with matching read/write shapes | Skip it — endpoint + DbContext is fine |
| MVP / early product, requirements shifting weekly | Skip it — ceremony slows the learning loop |
| Strong consistency required everywhere | Stay at Level 1–2 — async sync fights the requirement |
| No monitoring, tracing, or dead-letter handling yet | Do **not** go async (Level 3+) — eventual-consistency bugs are invisible without observability |

## CQRS myths

| Myth | Reality |
|---|---|
| CQRS requires event sourcing | Orthogonal patterns. Most CQRS systems have no event store; ES is the Level 4 option, not the definition |
| CQRS requires two databases | It's a responsibility split, not infrastructure. Levels 1–2 use one database |
| CQRS requires a message bus | Queues appear only when sync becomes async (Level 3+). In-process CQRS is complete CQRS |
| CQRS implies eventual consistency | Synchronous CQRS is valid and common — Level 2 updates read models in the same transaction |

## Dispatch options (2025+)

MediatR is commercial since v13. The decision table for *which mechanism* is in `grimoire.dotnet-clean-architecture` (`reference/application-layer.md`); the short version plus the wider field:

| Option | One-liner |
|---|---|
| **Plain handlers + DI** | Default for new projects — zero dependencies, you own ~50 lines; full setup in the clean-architecture skill |
| **Wolverine** | The upgrade path that buys something: source-generated pipeline (no reflection dispatch), built-in transactional outbox, retries, sagas, and a full message bus when you need Level 3 |
| **MediatR 12.x pinned** | Last Apache-2.0 version; fine for existing codebases, unmaintained |
| **MediatR 13+ (paid)** | Existing deep investment + budget; smoothest upgrade |
| **Cortex.Mediator** | MIT drop-in-style alternative if you just want free mediator semantics |
| **Brighter** | Mature command processor with built-in outbox/inbox; heavier conceptually |
| **FastEndpoints** | Endpoint-centric — command/query shape comes from the REPR pattern, no separate mediator |

→ Deep dive (full trade-off table, Wolverine code, vertical slice pairing): **[reference/dispatch-and-vertical-slices.md](reference/dispatch-and-vertical-slices.md)**

## Command design quick-reference

| Rule | Do this |
|---|---|
| Commands carry intent | `ShipOrder`, not `UpdateOrderStatus` — the verb is the business operation, validation and authorization hang off it |
| Returning data from commands is fine | Return the created ID, a `Result<T>`, or row version. The void-only purist stance is outdated — forcing a follow-up query to learn your own ID helps no one |
| Don't return query payloads | An ID or confirmation is not a query; a full DTO with joined display data is. If the client needs a screen, that's the query side's job |
| Idempotency at the boundary | Client-generated command ID (or `Idempotency-Key` header), dedup before side effects — retries and at-least-once delivery make duplicates a *when*, not an *if* |
| One transaction per command | Aggregate change + outbox row commit together; never assume a distributed transaction across stores |

```csharp
public sealed record PlaceOrderCommand(Guid CommandId, CustomerId CustomerId, IReadOnlyList<OrderLineDto> Lines)
    : ICommand<Result<OrderId>>;

// Handler returns the new ID — pragmatic CQRS, not a violation
public async Task<Result<OrderId>> Handle(PlaceOrderCommand cmd, CancellationToken ct)
{
    if (await _db.ProcessedCommands.AnyAsync(c => c.Id == cmd.CommandId, ct))
        return Result.Success(await GetExistingResultAsync(cmd.CommandId, ct)); // idempotent replay

    var order = Order.Place(cmd.CustomerId, cmd.Lines.Select(MapLine));
    _db.Orders.Add(order);
    _db.ProcessedCommands.Add(new ProcessedCommand(cmd.CommandId, order.Id));
    await _db.SaveChangesAsync(ct);                  // aggregate + dedup row + outbox: one transaction
    return Result.Success(order.Id);
}
```

→ Deep dive (outbox implementation, idempotency, versioning): **[reference/consistency-and-reliability.md](reference/consistency-and-reliability.md)**

## Read model quick-reference

| Rule | Do this |
|---|---|
| Shape by the screen, not the aggregate | A read model answers one consumer's question; denormalize freely, duplicate data without guilt |
| Queries take the shortest path | EF `.Select()` to DTO or Dapper — no aggregate loading, no tracking, no domain mapping on reads |
| Keep read models rebuildable | A read model must be derivable from the write side (or events) at any time — never the only home of a fact |
| Don't leak write-model types | Entities or value objects escaping into responses couple every screen to the domain's shape |
| Read-your-own-writes | After a command, query by ID against the write store (always current); only lists/searches go eventually consistent |

→ Deep dive (Level 2 and 3 techniques, projection rebuilds): **[reference/read-models-and-projections.md](reference/read-models-and-projections.md)**

## Anti-patterns

| Anti-pattern | Instead |
|---|---|
| CQRS everywhere | Apply per bounded context where the signals say it pays; CRUD the rest |
| Generic handler base classes (`BaseHandler<T>` with template methods) | Cross-cutting concerns are decorators/middleware (see clean-architecture skill), not inheritance |
| Bloated handlers (business logic in the handler) | Thin orchestration, fat domain — an `if` about business state belongs on the entity |
| Leaky read models (UI coupled to read-store schema) | Explicit response contracts; the read model is an implementation detail behind the query handler |
| Validation scattered across controller/handler/domain | Input shape → validator decorator; invariants → domain; existence/authz → handler/endpoint (table in clean-architecture skill) |
| Distributed transaction across write + read stores | Outbox pattern — commit locally, publish reliably, accept eventual consistency |
| Async CQRS with no observability | Correlation IDs, projection-lag metrics, dead-letter queues *before* the first async projection ships |
| Two databases on day one | Start Level 1; the ladder exists so you can climb it when pain arrives, not before |

## Which reference file do I need?

| You're working on… | Open |
|---|---|
| Choosing a level, justifying (or rejecting) CQRS, myths, escalation triggers | `reference/maturity-and-decision.md` |
| Picking a dispatch library, Wolverine handlers, vertical slice layout, command return values | `reference/dispatch-and-vertical-slices.md` |
| Read model design, EF/Dapper projections, denormalized tables, rebuilds | `reference/read-models-and-projections.md` |
| Outbox, idempotency, eventual-consistency UX, event/command versioning, observability | `reference/consistency-and-reliability.md` |
| Event sourcing, Marten streams and projections, the critter stack, snapshots | `reference/event-sourcing-marten.md` |

Recommendations draw on Martin Fowler's CQRS essay, Microsoft's Azure Architecture Center CQRS guidance, Greg Young's writings, Jimmy Bogard's vertical slice architecture, Oskar Dudycz's event-driven.io, and the Marten/Wolverine documentation — cited in the reference files.
