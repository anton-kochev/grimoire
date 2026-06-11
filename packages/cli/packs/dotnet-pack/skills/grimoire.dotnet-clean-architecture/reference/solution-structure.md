# Solution structure & the Dependency Rule

How to lay out a Clean Architecture solution in .NET — and when to choose a different layout entirely.

## Contents

- [The Dependency Rule](#the-dependency-rule)
- [The 4-project layout](#the-4-project-layout)
- [Composition root](#composition-root)
- [Folder organization inside each project](#folder-organization-inside-each-project)
- [When NOT to use Clean Architecture](#when-not-to-use-clean-architecture)
- [The hybrid approach](#the-hybrid-approach)
- [Reference templates compared](#reference-templates-compared)

---

## The Dependency Rule

Source-code dependencies point inward only. Domain is the center; each outer ring may reference inner rings, never the reverse, and never a sibling going outward.

Why it matters:

- **Testability** — Domain and Application compile without EF Core, ASP.NET Core, or any I/O. Unit tests need no infrastructure.
- **Framework independence** — business rules survive an ORM swap, a UI rewrite, a message-bus migration. The framework is a detail.
- **Compile-time enforcement** — in .NET the rule is enforced by *project references*, not discipline. If Domain has no reference to EF Core, a `using Microsoft.EntityFrameworkCore;` in an entity is a build error.

The corollary that trips people up: when an inner layer needs something from an outer layer (the Application needs to send email), the inner layer defines an **interface (port)** and the outer layer implements it. Dependency inversion is the mechanism that keeps arrows pointing inward.

---

## The 4-project layout

```text
src/
  MyApp.Domain/             — no project references, no framework packages
  MyApp.Application/        — references Domain
  MyApp.Infrastructure/     — references Application (and transitively Domain)
  MyApp.Web/                — references Application + Infrastructure
tests/
  MyApp.Domain.UnitTests/
  MyApp.Application.UnitTests/
  MyApp.ArchitectureTests/
  MyApp.IntegrationTests/
```

The allowed edges, as `.csproj` references:

```xml
<!-- MyApp.Application.csproj -->
<ItemGroup>
  <ProjectReference Include="..\MyApp.Domain\MyApp.Domain.csproj" />
</ItemGroup>

<!-- MyApp.Infrastructure.csproj -->
<ItemGroup>
  <ProjectReference Include="..\MyApp.Application\MyApp.Application.csproj" />
</ItemGroup>

<!-- MyApp.Web.csproj -->
<ItemGroup>
  <ProjectReference Include="..\MyApp.Application\MyApp.Application.csproj" />
  <ProjectReference Include="..\MyApp.Infrastructure\MyApp.Infrastructure.csproj" />
</ItemGroup>
```

Notes:

- **Web references Infrastructure for one reason only**: the composition root must register Infrastructure's implementations. Endpoint code should never use Infrastructure types directly — an architecture test can enforce that (see `testing-and-antipatterns.md`).
- **Domain has zero `PackageReference`s** beyond analyzers. If a package "feels harmless" (a Guid generator, a validation lib), define the abstraction in Domain and implement it outside instead.
- Smaller solutions sometimes merge Web+Infrastructure or Application+Domain. Merging is fine *as a starting point* — keep the namespaces separated so splitting later is mechanical.

---

## Composition root

`Program.cs` in Web is the only place that knows about every layer. Keep it thin by giving each layer a DI extension method it owns:

```csharp
// MyApp.Application/DependencyInjection.cs
public static class DependencyInjection
{
    public static IServiceCollection AddApplication(this IServiceCollection services)
    {
        services.Scan(scan => scan                       // Scrutor
            .FromAssembliesOf(typeof(DependencyInjection))
            .AddClasses(c => c.AssignableTo(typeof(ICommandHandler<,>)))
            .AsImplementedInterfaces()
            .WithScopedLifetime());

        services.AddValidatorsFromAssembly(typeof(DependencyInjection).Assembly);
        return services;
    }
}

// MyApp.Infrastructure/DependencyInjection.cs
public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(
        this IServiceCollection services, IConfiguration configuration)
    {
        services.AddDbContext<ApplicationDbContext>(options =>
            options.UseNpgsql(configuration.GetConnectionString("Default")));
        services.AddScoped<IApplicationDbContext>(sp =>
            sp.GetRequiredService<ApplicationDbContext>());
        services.AddScoped<IEmailSender, SmtpEmailSender>();
        return services;
    }
}

// MyApp.Web/Program.cs
builder.Services
    .AddApplication()
    .AddInfrastructure(builder.Configuration);
```

This keeps registration next to the code it registers, and `Program.cs` reads as a table of contents.

---

## Folder organization inside each project

Organize Application by **use case**, not by technical type. A folder per feature keeps everything that changes together in one place:

```text
MyApp.Application/
  Orders/
    ShipOrder/
      ShipOrderCommand.cs
      ShipOrderHandler.cs
      ShipOrderValidator.cs
    GetOrderById/
      GetOrderByIdQuery.cs
      GetOrderByIdHandler.cs
      OrderResponse.cs
  Abstractions/          — ports: IApplicationDbContext, IEmailSender, IDateTimeProvider
  Common/                — Result, pipeline decorators
```

Avoid the classic `Commands/`, `Queries/`, `Validators/`, `Dtos/` type-based folders — they scatter a single feature across four directories and recreate the "8 files in 8 places" problem inside one project.

Domain is organized by aggregate: `Domain/Orders/` holds `Order`, `OrderLine`, `OrderStatus`, `OrderErrors`, and the order events.

---

## When NOT to use Clean Architecture

Clean Architecture is a tool for protecting complex, long-lived business logic. It is the wrong default for:

- **CRUD-heavy applications** — if 90% of features are "load row, edit field, save row," four layers add ceremony with nothing to protect.
- **Rapid prototypes / early-stage products** — requirements churn favors code locality (everything for a feature in one folder) over abstraction boundaries.
- **Small services with one or two use cases** — a minimal API with a DbContext is a complete, honest architecture.

The alternative is **vertical slice architecture**: organize by feature end-to-end; each slice contains its endpoint, request, handler, and data access. Slices favor *code locality* — "artifacts that change together are grouped together" — at the cost of less structural uniformity and possible duplication across slices.

| Aspect | Clean Architecture | Vertical slice |
|---|---|---|
| Change impact | Scattered across 4 projects | Contained in one folder |
| Testing style | Unit tests + mocked ports | Integration-leaning |
| Onboarding | Clear structural rules | Requires judgment |
| Ceremony | Higher | Minimal |

---

## The hybrid approach

The current consensus (2025/2026) treats the two as a spectrum, not a binary:

1. **Macro level: feature folders** (vertical-slice style) so each feature is locatable in one place.
2. **Micro level: clean-architecture discipline inside complex features** — a rich domain model, ports, and handler orchestration *where the logic warrants it*.
3. **Shared kernel**: common entities and value objects stay persistence-ignorant and are shared across slices.

Practical migration paths:

- *Slices → Clean*: when a slice accumulates real invariants, extract a domain model from it; the slice's handler becomes a thin use case.
- *Clean → Slices*: when layers feel like pass-through ceremony, collapse simple read paths into endpoint-level queries while keeping the domain core for writes.

Rule of thumb: **start with slices, extract a domain core when complexity demands it** — extracting a domain model later is far cheaper than carrying four layers that never earn their keep.

---

## Reference templates compared

| Template | Choices |
|---|---|
| **Jason Taylor** (`jasontaylordev/CleanArchitecture`, .NET 10) | CQRS throughout, use-case folders, EF Core exposed to Application via `IApplicationDbContext` port — no repository layer |
| **Ardalis / Steve Smith** (`ardalis/CleanArchitecture`, ASP.NET Core 10) | DDD-leaning: aggregates, specifications pattern, repository over EF Core, domain events via MediatR notifications |
| **Milan Jovanovic** (writings/templates) | Rich domain + result pattern, explicit ports, architecture tests as a first-class citizen |

The Taylor and Ardalis templates disagree on repositories (port-over-DbContext vs specification-repositories) — both are legitimate; pick one per solution and stay consistent. Both templates historically used MediatR, which is commercial since v13 — see `application-layer.md` for the current options.

Sources: [The Clean Architecture (Uncle Bob)](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html) · [Clean Architecture in .NET (Milan Jovanovic)](https://www.milanjovanovic.tech/blog/clean-architecture-dotnet) · [Vertical Slice vs Clean Architecture](https://nadirbad.dev/vertical-slice-vs-clean-architecture) · [Jason Taylor template](https://github.com/jasontaylordev/CleanArchitecture) · [Ardalis template](https://github.com/ardalis/cleanarchitecture)
