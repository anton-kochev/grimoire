# Dispatch options & vertical slices

The 2025+ mediator landscape after MediatR went commercial, Wolverine in practice, pairing CQRS with vertical slice architecture, and what commands may return.

## Contents

- [The dispatch trade-off table](#the-dispatch-trade-off-table)
- [Plain handlers: the default](#plain-handlers-the-default)
- [Wolverine in practice](#wolverine-in-practice)
- [The other contenders](#the-other-contenders)
- [Vertical slices and CQRS](#vertical-slices-and-cqrs)
- [Returning data from commands](#returning-data-from-commands)

---

## The dispatch trade-off table

MediatR v13+ (July 2025) requires a commercial license for most professional use; 12.x remains Apache 2.0 but unmaintained. The realistic field:

| Option | License | Dispatch | Pipeline model | Messaging story | Migration cost from MediatR |
|---|---|---|---|---|---|
| **Plain handlers + DI** | None (your code) | Direct injection, compile-time | Decorators (Scrutor) | None — pair with anything | Low: mechanical interface rename |
| **Wolverine** | Open core (JasperFx) | Source-generated, no reflection | Conventional middleware | Built-in bus: Rabbit, Azure Service Bus, Kafka; outbox, sagas, scheduling | Medium: conventions replace interfaces |
| **MediatR 12.x (pinned)** | Apache 2.0 | Reflection | `IPipelineBehavior<,>` | None | Zero — but it's a parked car |
| **MediatR 13+** | Commercial | Reflection | `IPipelineBehavior<,>` | None | Zero + invoice |
| **Cortex.Mediator** | MIT | Reflection | Behaviors (MediatR-like) | None | Low: near drop-in semantics |
| **Brighter** | MIT | Command processor | Attribute-based pipeline | Built-in outbox/inbox, many transports | Medium-high: different mental model |
| **FastEndpoints** | MIT | None (endpoint = handler) | Pre/post processors | None | Medium: restructure around REPR |

Decision shortcuts:

- New project, no async messaging on the horizon → **plain handlers**. The full setup (interfaces, Scrutor scan, decorators) is in `grimoire.dotnet-clean-architecture`, `reference/application-layer.md` — not repeated here.
- New project that will hit Level 3 (separate stores, async projections) → **Wolverine**: the outbox and bus you'd otherwise hand-roll are built in.
- Existing MediatR codebase, no budget → pin 12.x and stop worrying; revisit only when you need something 12.x doesn't do.

---

## Plain handlers: the default

One note beyond the clean-architecture skill's setup, specific to CQRS at higher ladder levels: plain handlers stay viable at Level 2 (the read-table update is just more code in the handler's transaction), but at Level 3 you start hand-rolling outbox publishing, retries, and consumer dedup. That hand-rolled stack is exactly Wolverine's feature list — which is why the climb to Level 3 is the natural moment to reconsider the dispatch choice, not before.

---

## Wolverine in practice

Wolverine discovers handlers by convention — no interface, no base class. A handler is a class ending in `Handler` (or `Consumer`) with a `Handle`/`Consume` method:

```csharp
public static class PlaceOrderHandler
{
    // Wolverine injects method parameters; statics are idiomatic
    public static async Task<OrderPlaced> Handle(
        PlaceOrder command, IDocumentSession session, CancellationToken ct)
    {
        var order = Order.Place(command.CustomerId, command.Lines);
        session.Store(order);
        return new OrderPlaced(order.Id, order.Total);   // cascading message — published after commit
    }
}
```

What's notable versus a classic mediator:

- **Source-generated pipeline.** Wolverine generates the dispatch code at startup (or build time) — no reflection per call, and you can inspect the generated code when debugging the pipeline.
- **Cascading messages.** Returning a message (or `IEnumerable` of them) from a handler publishes it *after* the transaction commits — the outbox semantics fall out of the programming model instead of being bolted on.
- **Transactional middleware.** `[Transactional]` or the `AutoApplyTransactions` policy wraps the handler, the stored changes, and the outgoing messages in one unit of work — EF Core and Marten both supported.
- **In-process today, distributed tomorrow.** `IMessageBus.InvokeAsync` (in-process, like a mediator) and `PublishAsync` (through the bus) share handler code; climbing to Level 3 is configuration, not a rewrite.

```csharp
// Program.cs
builder.Host.UseWolverine(opts =>
{
    opts.Policies.AutoApplyTransactions();
    opts.PublishMessage<OrderPlaced>().ToRabbitQueue("orders");
    opts.UseEntityFrameworkCoreTransactions();   // or IntegrateWithWolverine() on Marten
});
```

The cost: convention-based discovery means less explicit wiring to read, and the "magic" budget of the team has to cover it. Teams that hate implicit behavior should weigh plain handlers + hand-rolled outbox against that discomfort honestly.

---

## The other contenders

**Cortex.Mediator** — MIT, MediatR-shaped (commands, queries, notifications, behaviors). The pragmatic choice when the team wants familiar mediator semantics without a license and without adopting a messaging platform. Younger project; evaluate maintenance cadence before betting on it.

**Brighter** — long-lived MIT command processor with first-class outbox/inbox, claim-check, and many transports. Conceptually heavier than a mediator (requests vs events, command processor vs dispatcher); strongest when you want messaging-grade reliability patterns with an OSS license and don't want Wolverine's conventions.

**FastEndpoints** — dissolves the question: the endpoint class *is* the handler (REPR pattern — request, endpoint, response). CQRS emerges as endpoint granularity rather than a dispatch layer. Good fit for API-first services that were never going to share handlers across entry points; poor fit when commands must also run from consumers, jobs, or other non-HTTP contexts.

---

## Vertical slices and CQRS

Bogard's observation: HTTP already splits your system into commands (POST/PUT/DELETE) and queries (GET), so organizing by feature *gives you CQRS out of the gate*. A slice is one command or one query plus everything it needs:

```text
Features/
  Orders/
    PlaceOrder/
      PlaceOrderEndpoint.cs      // maps the route, calls the handler
      PlaceOrderCommand.cs       // record with the intent + data
      PlaceOrderHandler.cs       // orchestration
      PlaceOrderValidator.cs     // input-shape validation
    GetOrderDetails/
      GetOrderDetailsEndpoint.cs
      GetOrderDetailsQuery.cs
      GetOrderDetailsHandler.cs
      OrderDetailsResponse.cs    // read model shaped by this screen
```

Why the pairing works so well:

- **Coupling follows the seam that changes together.** A feature request touches one folder, not four projects.
- **Each slice picks its own rung.** `PlaceOrder` goes through the full domain model; `GetOrderDetails` is a Dapper one-liner. No layer police insisting both look the same — this is the maturity ladder applied per use case.
- **Read models stop pretending.** The response type lives next to the query that fills it, shaped by the screen, with no temptation to reuse the write model.

The discipline that keeps slices healthy: slices don't call other slices' handlers. Shared *domain* logic sinks into the domain model; shared *infrastructure* into shared abstractions. A slice reaching into a sibling's folder is the layering problem reborn sideways.

For the macro decision (vertical slices vs layered vs hybrid solution structure), see `grimoire.dotnet-clean-architecture`, `reference/solution-structure.md`.

---

## Returning data from commands

The strict reading of command-query separation ("commands return nothing") comes from method-level CQS, and applying it to use-case-level CQRS is a category error. The 2025 consensus is pragmatic:

| Return | Verdict |
|---|---|
| Nothing / ack | Fine for fire-and-forget semantics, but rarely what HTTP callers want |
| New entity ID | **Yes** — the canonical case. Forcing a client to query for the ID it just caused to exist is ceremony, not purity |
| `Result<T>` with outcome info | **Yes** — business-rule failures are part of the command's contract (see result pattern in `grimoire.dotnet-clean-architecture`) |
| Row version / concurrency token | **Yes** — enables the client's next conditional update without a read round-trip |
| Server-computed confirmation values (total, number, state) | Acceptable when produced *by* the command's own transaction — returning what you just computed is not a query |
| A full display DTO with joined data | **No** — that's a query wearing a trench coat. The handler now serves two masters and changes for two reasons |

Litmus test: if the data you're returning was *produced or decided by this command's transaction*, return it. If you'd have to go *fetch* it for the response, it belongs to the query side.

```csharp
app.MapPost("/orders", async (PlaceOrderRequest req, IMessageBus bus, CancellationToken ct) =>
{
    var result = await bus.InvokeAsync<Result<OrderId>>(req.ToCommand(), ct);
    return result.IsSuccess
        ? Results.CreatedAtRoute("GetOrderDetails", new { id = result.Value.Value })  // 201 + Location: the REST-shaped answer
        : result.ToProblemDetails();
});
```

Sources: [Wolverine docs](https://wolverinefx.net/) · [Wolverine for MediatR users (Jeremy Miller)](https://jeremydmiller.com/2025/01/28/wolverine-for-mediatr-users/) · [Vertical slice architecture (Jimmy Bogard)](https://www.jimmybogard.com/vertical-slice-architecture/) · [MediatR licensing update (Jimmy Bogard)](https://www.jimmybogard.com/automapper-and-mediatr-licensing-update/) · [Brighter docs](https://brightercommand.gitbook.io/paramore-brighter-documentation/) · [FastEndpoints](https://fast-endpoints.com/)
