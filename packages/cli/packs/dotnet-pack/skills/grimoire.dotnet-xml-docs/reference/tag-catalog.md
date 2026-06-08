# XML Documentation Tag Catalog

Complete syntax reference for the C# XML documentation tags recognized by the compiler, per [Microsoft Learn — Recommended XML documentation tags](https://learn.microsoft.com/en-us/dotnet/csharp/language-reference/xmldoc/recommended-tags).

The compiler **verifies the syntax** of `<param>`, `<exception>`, `<include>`, `<see>`, `<seealso>`, and `<typeparam>` (and any `cref`). Visual Studio additionally provides IntelliSense for `<remarks>`, `<example>`, and `<inheritdoc>`. The compiler/VS also validate the HTML tags `<b>`, `<i>`, `<u>`, `<br/>`, and `<a>`.

## Table of contents

- [General tags](#general-tags) — `<summary>`, `<remarks>`
- [Member tags](#member-tags) — `<returns>`, `<param>`, `<paramref>`, `<exception>`, `<value>`
- [Generic tags](#generic-tags) — `<typeparam>`, `<typeparamref>`
- [Formatting tags](#formatting-tags) — `<para>`, `<list>`, `<c>`, `<code>`, `<example>`, `<b>`/`<i>`/`<u>`, `<br/>`, `<a>`
- [Reuse tags](#reuse-tags) — `<inheritdoc>`, `<include>`
- [Link tags](#link-tags) — `<see>`, `<seealso>`, `cref`, `href`
- [Escaping and generics in cref](#escaping-and-generics-in-cref)
- [User-defined tags](#user-defined-tags)

## General tags

### `<summary>`

```xml
<summary>description</summary>
```

Describes a type or member. The single most important tag — it surfaces in IntelliSense and the Object Browser. Keep it to one sentence; move detail to `<remarks>`.

### `<remarks>`

```xml
<remarks>
description
</remarks>
```

Supplemental information beyond the `<summary>`: behavior, invariants, usage notes, threading, performance caveats. Can be long. Markdown inside a `CDATA` section is processed by tools such as DocFX:

```csharp
/// <remarks>
/// <![CDATA[
/// Uses a *binary search*, so the input *must* be sorted ascending.
/// ]]>
/// </remarks>
```

## Member tags

### `<returns>`

```xml
<returns>description</returns>
```

Describes the return value of a method. Describe what the caller gets, not the declared type. Omit on `void`.

### `<param>`

```xml
<param name="name">description</param>
```

Describes one parameter; use one tag per parameter. `name` must match the signature exactly — the compiler warns on a mismatch or an undocumented parameter. Appears in IntelliSense.

### `<paramref>`

```xml
<paramref name="name"/>
```

Marks a word in prose (inside `<summary>`, `<remarks>`, etc.) as a reference to parameter `name`, so tools can format it distinctly (bold/italic).

### `<exception>`

```xml
<exception cref="member">description</exception>
```

Documents an exception the member can throw. `cref` must resolve to an exception type in scope. Apply to methods, properties, events, and indexers. Document **contract** exceptions only — not every internal guard throw.

### `<value>`

```xml
<value>property-description</value>
```

Describes the value a property represents. Complements `<summary>` on properties and indexers.

## Generic tags

### `<typeparam>`

```xml
<typeparam name="TResult">The type of the result produced by the operation.</typeparam>
```

One per type parameter on a generic type or method declaration. Shown in IntelliSense.

### `<typeparamref>`

```xml
<typeparamref name="TKey"/>
```

References a type parameter from within prose, so tools can format it distinctly.

## Formatting tags

### `<para>`

```xml
<remarks>
    <para>First paragraph.</para>
    <para>Second paragraph.</para>
</remarks>
```

Adds a double-spaced paragraph inside another tag. Use `<br/>` for a single-spaced line break.

### `<list>`

```xml
<list type="bullet|number|table">
    <listheader>
        <term>term</term>
        <description>description</description>
    </listheader>
    <item>
        <term>Namespace</term>
        <description>A logical grouping of related types.</description>
    </item>
</list>
```

Bullet, numbered, or table/definition list. For a table, supply a `term` in the header and a `description` per item; for a definition list, each `item` carries both `term` and `description`.

### `<c>`

```xml
<c>text</c>
```

Marks inline text as code within a description.

### `<code>`

```xml
<code>
var index = 5;
index++;
</code>
```

A multi-line code block, typically nested inside `<example>`.

### `<example>`

```xml
<example>
This shows how to increment an integer.
<code>
var index = 5;
index++;
</code>
</example>
```

A usage example for a member. Commonly pairs with `<code>`.

### `<b>` / `<i>` / `<u>`

```xml
<b>bold</b> <i>italic</i> <u>underline</u>
```

Inline HTML formatting, validated by the compiler and VS; renders in IntelliSense and generated docs. (The deprecated `<tt>` is validated but should be replaced by `<c>`.)

### `<br/>`

```xml
Line one<br/>Line two
```

Single-spaced line break — the lighter alternative to `<para>`.

### `<a>`

```xml
<a href="https://example.com">Link text</a>
```

Inline hyperlink to an external URL.

## Reuse tags

### `<inheritdoc>`

```xml
<inheritdoc [cref="member"] [path="xpath"]/>
```

Inherits XML comments from a base class, implemented interface, or a specified member — eliminating copy-paste and keeping docs in sync. On a type, members inherit too. Inherited tags don't override tags already defined on the member.

- `cref` — inherit from a specific member (e.g. a sync method → async twin).
- `path` — an XPath filter selecting which inherited tags to include.

Note: the IDE auto-inherits even without the tag, but the **generated XML file does not** — write `<inheritdoc/>` explicitly for distributed libraries.

### `<include>`

```xml
<include file='filename' path='tagpath[@name="id"]' />
```

Pulls documentation from an external XML file via XPath, keeping long-form docs out of the source file. `file` is relative to the source; `path` is the XPath to the member's comment node. The external file mirrors the structure of the compiler-generated XML (`<doc><members><member name="...">…`). The .NET runtime team uses this extensively.

## Link tags

### `<see>`

```xml
<see cref="member"/>
<see cref="member">Link text</see>
<see href="https://example.com">Link Text</see>
<see langword="true"/>
```

An inline link. Use `cref` for code references (compiler-verified, auto-hyperlinked by doc tools), `href` for clickable external URLs, and `langword` for language keywords (`true`, `null`, `await`, …). Note: `cref` to an external URL does **not** produce a clickable link — use `href` for URLs.

### `<seealso>`

```xml
<seealso cref="member"/>
<seealso href="https://example.com">Link Text</seealso>
```

Adds an entry to the **See Also** section. Cannot be nested inside `<summary>`.

### cref attribute

"Code reference." Marks the inner text/target as a code element; doc tools (DocFX, Sandcastle) turn it into a hyperlink to that element's page. The compiler resolves it against `using` directives and warns if it doesn't exist.

### href attribute

A reference to a web page. Use it for external links so they're clickable in tooltips and generated docs.

## Escaping and generics in cref

- Literal angle brackets in text: use `&lt;` and `&gt;`.

  ```csharp
  /// <summary>Always returns a value &lt; 1.</summary>
  ```

- Generic references in `cref`: use escaped brackets **or** braces (the compiler reads braces as angle brackets):

  ```csharp
  /// <see cref="IDictionary{TKey, TValue}"/>
  /// <see cref="List&lt;T&gt;"/>
  ```

## User-defined tags

The compiler copies any well-formed XML it doesn't recognize straight to the output file. Tools like Sandcastle add their own tags (`<event>`, `<note>`, namespace docs). You can invent tags for a custom pipeline — just keep the document well-formed, or the compiler warns and the XML output records the error.
