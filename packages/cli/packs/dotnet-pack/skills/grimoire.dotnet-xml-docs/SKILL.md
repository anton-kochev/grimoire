---
name: grimoire.dotnet-xml-docs
description: "Microsoft-recommended conventions for documenting C#/.NET code with XML doc comments — the right tag for each element, the modern intent-over-noise style, and inheritdoc to stay DRY. Use when documenting C# code, adding /// comments, writing summary/param/returns/exception/value tags, enabling GenerateDocumentationFile, resolving CS1591 warnings, or generating an API doc site with DocFX."
---

# .NET XML Documentation

Expert guidance for documenting C#/.NET code with XML documentation comments (`///`), following Microsoft's current recommendations.

**Default approach**: document the public surface with `///` comments written in the *intent-over-noise* style, and enable the documentation file so the compiler enforces completeness.

XML doc comments are still the standard for .NET. What's modernized is the **style** (describe intent, not the signature) and the **tooling** (DocFX, `<inheritdoc>`, compiler verification).

## Enable documentation output

Add to the `.csproj` (or `Directory.Build.props` to cover a whole solution):

```xml
<PropertyGroup>
  <GenerateDocumentationFile>true</GenerateDocumentationFile>
</PropertyGroup>
```

The compiler then:

- emits `YourAssembly.xml` next to the build output — this feeds IntelliSense, analyzers, and doc generators;
- raises **CS1591** for every publicly visible member missing a `<summary>`. Treat that warning list as a documentation to-do checklist.

Make missing docs a hard gate by promoting the warning to an error:

```xml
<WarningsAsErrors>CS1591</WarningsAsErrors>
```

To intentionally skip a region (generated code, an internal-only assembly), scope a `#pragma warning disable CS1591` / `restore CS1591`, or set `<NoWarn>$(NoWarn);CS1591</NoWarn>` on projects that aren't a public API.

**The compiler validates your docs.** `<param name="...">` must match a real parameter, and `cref="..."` must resolve to a real code element — mismatches are warnings. This is the mechanism that keeps comments from silently drifting out of sync with signatures, so lean on it.

## What to document

- **Document the entire public surface** — all publicly visible types and members. At minimum, each gets a `<summary>`.
- Private/internal members *can* carry XML comments, but documenting them exposes inner (potentially confidential) workings — do it only when it genuinely helps maintainers.
- You **cannot** apply a doc comment to a namespace.
- Write complete sentences that end with a period.

## The modern style — intent over noise

This is the difference between useful docs and clutter. Microsoft's guidance verbatim: *"Describe intent, invariants, and important usage constraints — skip restating obvious type names or parameter types."*

❌ **Noise** — restates the signature, adds nothing a reader couldn't see:

```csharp
/// <summary>Gets or sets the name.</summary>
public string Name { get; set; }

/// <summary>Processes the order.</summary>
/// <param name="order">The order.</param>
public void ProcessOrder(Order order) { }
```

✅ **Intent** — explains role, invariants, and constraints:

```csharp
/// <summary>The customer's full legal name, as printed on invoices and statements.</summary>
public string Name { get; set; }

/// <summary>Validates, charges, and persists <paramref name="order"/>, then raises <see cref="OrderPlaced"/>.</summary>
/// <param name="order">The order to place; must contain at least one line item.</param>
/// <exception cref="PaymentDeclinedException">The customer's payment method was rejected.</exception>
public void ProcessOrder(Order order) { }
```

**Rules of thumb:**

- Keep `<summary>` to **one sentence**. Need more? Push secondary context into `<remarks>`.
- Say *what* and *why*, plus constraints and invariants — not *how* (the code already shows how).
- Don't repeat the member or type name; don't write "the order" for a parameter literally named `order`.
- Link, don't restate: reference other API with `<see cref="..."/>` and parameters with `<paramref name="..."/>` so prose stays connected and compiler-verified.
- Start a property summary with "Gets"/"Gets or sets" only when it adds meaning; otherwise describe the value itself.

## Which tag for which element

| Element | Always | Add when relevant |
|---------|--------|-------------------|
| Type (class/struct/interface/enum/delegate) | `<summary>` | `<remarks>`, `<typeparam>` (generic), `<example>` |
| Method | `<summary>` | `<param>`, `<returns>`, `<exception>`, `<typeparam>`, `<remarks>` |
| Property / indexer | `<summary>` | `<value>`, `<exception>`, `<remarks>` |
| Constructor | `<summary>` | `<param>`, `<exception>`, `<remarks>` |
| Field / const | `<summary>` | `<value>` |
| Event | `<summary>` | `<remarks>` |
| Record (positional) | `<summary>` + one `<param>` per positional parameter **on the type** | `<remarks>` |

```csharp
/// <summary>An immutable money amount in a specific currency.</summary>
/// <param name="Amount">The monetary value; may be negative for debits.</param>
/// <param name="Currency">The ISO 4217 currency code, e.g. "USD".</param>
public record Money(decimal Amount, string Currency);
```

Full per-tag syntax, attributes, and edge cases: see [reference/tag-catalog.md](reference/tag-catalog.md).

### Tag specifics that matter

- **`<returns>`** — describe what the caller receives, not the return type. Omit on `void`.
- **`<exception cref="...">`** — only for *intentional, contract* exceptions a caller should anticipate. Don't document every guard-clause throw from a shared validation helper.
- **`<value>`** — on a property, describes the value it represents; complements `<summary>` rather than repeating it.
- **`<typeparam name="T">`** — one per generic type parameter, on the type or method declaration.
- **`<paramref>` / `<typeparamref>`** — refer to a parameter / type parameter from inside prose so tools can format and verify it.
- **`<see>`** — `cref` links to code (compiler-verified, auto-hyperlinked by DocFX/Sandcastle); `href` links to external URLs (clickable in tooltips); `langword` formats a keyword, e.g. `<see langword="null"/>`.

## Stay DRY with `<inheritdoc/>`

Don't copy-paste docs onto overrides, interface implementations, or async twins — inherit them:

```csharp
public interface IRepository<T>
{
    /// <summary>Finds the entity with the given identifier, or <see langword="null"/> if none exists.</summary>
    /// <param name="id">The unique identifier to look up.</param>
    Task<T?> FindAsync(int id);
}

public sealed class SqlRepository<T> : IRepository<T>
{
    /// <inheritdoc/>
    public Task<T?> FindAsync(int id) => /* ... */;
}
```

- `<inheritdoc/>` on a type inherits its members' docs too. You may append extra tags (e.g. a specialized `<remarks>`) after it.
- `<inheritdoc cref="..."/>` copies from a specific member — handy for a sync method → its async twin.
- `<inheritdoc path="..."/>` takes an XPath filter to inherit only selected tags.
- Caveat: Visual Studio auto-inherits docs in the IDE even without the tag, **but the generated XML file does not**. For distributed libraries, write `<inheritdoc/>` (or full docs) explicitly so consumers get them.

## Match existing conventions first

Before writing, detect what the project already does — consistency with the codebase beats any external "ideal":

1. Is `GenerateDocumentationFile` already on? Are there `<inheritdoc>` patterns, an `.editorconfig` documentation rule, or a `docfx.json`?
2. Match the established voice (terse vs. detailed), the tag set in use, and how `<remarks>` is applied.
3. Mirror the existing summary phrasing style (e.g. "Gets…" vs. noun phrases) so the file reads as one hand.

## Generating a doc site

XML comments power IntelliSense for free. To publish browsable API docs, **DocFX** (a .NET Foundation project shipping a modern template) builds a static HTML site from your XML comments plus Markdown and deploys to GitHub Pages via Actions. Setup, MSBuild props, CS1591 control, and CI: see [reference/tooling.md](reference/tooling.md).

## Checklist

- [ ] `GenerateDocumentationFile` enabled; CS1591 resolved (or scoped off intentionally)
- [ ] Every public type/member has a one-sentence `<summary>` describing intent, not the signature
- [ ] `<param>` / `<typeparam>` present, with names matching the declaration exactly
- [ ] `<returns>` on non-void methods; `<value>` on properties where it adds clarity
- [ ] `<exception>` for contract exceptions only
- [ ] `<inheritdoc/>` on overrides/implementations instead of copy-paste
- [ ] `<see cref>` / `<paramref>` used for links; project builds with no documentation warnings
