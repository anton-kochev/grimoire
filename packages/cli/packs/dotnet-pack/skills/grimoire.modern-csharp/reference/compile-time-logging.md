# Compile-time logging — the `[LoggerMessage]` source generator

High-performance, structured logging in .NET 6+. The `[LoggerMessage]` source generator turns a `partial` method into allocation-free, strongly-typed logging code at compile time. This is the recommended way to log in modern .NET — analyzer **CA1848** flags `ILogger.LogInformation(...)` calls in favor of it.

## Contents

- [Why it beats the alternatives](#why-it-beats-the-alternatives)
- [Basic syntax](#basic-syntax)
- [Static, instance, and extension forms](#static-instance-and-extension-forms)
- [Dynamic log level](#dynamic-log-level)
- [Exceptions](#exceptions)
- [Best practices](#best-practices)
- [Method constraints](#method-constraints)
- [Redaction of sensitive data](#redaction-of-sensitive-data)
- [Migrating from LoggerMessage.Define](#migrating-from-loggermessagedefine)

---

## Why it beats the alternatives

```csharp
// ✗ classic: parses the template every call, boxes the int, allocates an object[]
logger.LogInformation("Processed order {OrderId} for {CustomerId}", orderId, customerId);

// ✓ source-generated: template parsed at compile time, no boxing, no array
Log.OrderProcessed(logger, orderId, customerId);
```

| | `[LoggerMessage]` | `LogInformation(...)` | `LoggerMessage.Define` |
|---|---|---|---|
| Value-type boxing | none | boxes each value arg | none |
| Template parsing | compile time | every call | once (cached) |
| Allocations on hot path | none | `object[]` + boxes | none |
| Max parameters | unlimited | unlimited | 6 |
| Dynamic log level | yes | n/a | no |
| Boilerplate | one attribute | none | manual delegate field |
| Compiler diagnostics | yes | no | no |

The win is biggest when the log statement is on a hot path **and** the level is often disabled — the generated code checks `IsEnabled` first and does zero work (no boxing, no allocation) when the level is off.

Sources: [Compile-time logging source generation](https://learn.microsoft.com/en-us/dotnet/core/extensions/logger-message-generator) · [High-performance logging](https://learn.microsoft.com/en-us/dotnet/core/extensions/logging/high-performance-logging) · [CA1848](https://learn.microsoft.com/en-us/dotnet/fundamentals/code-analysis/quality-rules/ca1848)

---

## Basic syntax

A `static partial` class with `partial` methods marked `[LoggerMessage]`. The generator writes the bodies.

```csharp
public static partial class Log
{
    [LoggerMessage(
        EventId = 1,
        Level = LogLevel.Information,
        Message = "Processed order {OrderId} for {CustomerId} in {ElapsedMs} ms")]
    public static partial void OrderProcessed(
        ILogger logger, string orderId, int customerId, long elapsedMs);
}
```

Placeholders in `Message` (`{OrderId}`) bind to parameters **by name, case-insensitively** — `orderId` matches `{OrderId}`. They are emitted as structured-log properties, not just substituted into text, so sinks like JSON console or Serilog can index on `OrderId`.

A format specifier works too: `Message = "Ratio is {Ratio:P2}"`.

---

## Static, instance, and extension forms

```csharp
// 1. static helper — pass the ILogger explicitly
public static partial class Log
{
    [LoggerMessage(EventId = 2, Level = LogLevel.Warning, Message = "Retry {Attempt} for {Url}")]
    public static partial void Retrying(ILogger logger, int attempt, string url);
}

// 2. extension method — reads like logger.Retrying(...)
public static partial class LogExtensions
{
    [LoggerMessage(EventId = 2, Level = LogLevel.Warning, Message = "Retry {Attempt} for {Url}")]
    public static partial void Retrying(this ILogger logger, int attempt, string url);
}

// 3. instance — class holds the ILogger field (traditional constructor, not primary)
public sealed partial class OrderService
{
    private readonly ILogger<OrderService> _logger;
    public OrderService(ILogger<OrderService> logger) => _logger = logger;

    [LoggerMessage(EventId = 3, Level = LogLevel.Information, Message = "Order {OrderId} shipped")]
    private partial void LogShipped(string orderId);

    public void Ship(Order o) { /* ... */ LogShipped(o.Id); }
}
```

For the instance form the generator finds an `ILogger` field/property on the class — no need to pass it per call.

---

## Dynamic log level

Omit `Level` in the attribute and take a `LogLevel` parameter to decide the level at the call site.

```csharp
public static partial class Log
{
    [LoggerMessage(EventId = 4, Message = "External call to {Service} returned {Status}")]
    public static partial void ExternalCall(ILogger logger, LogLevel level, string service, int status);
}

Log.ExternalCall(logger, status >= 500 ? LogLevel.Error : LogLevel.Information, "billing", status);
```

---

## Exceptions

The first `Exception`-typed parameter is logged **as the exception** (attached to the entry, full stack trace), not formatted into the message.

```csharp
public static partial class Log
{
    [LoggerMessage(EventId = 5, Level = LogLevel.Error, Message = "Failed to process order {OrderId}")]
    public static partial void OrderFailed(ILogger logger, Exception ex, string orderId);
}

try { Process(order); }
catch (Exception ex) { Log.OrderFailed(logger, ex, order.Id); }
```

Note `{OrderId}` is the only placeholder — the exception isn't referenced in the template; it's carried separately.

---

## Best practices

- **PascalCase placeholder names** (`{OrderId}`, `{ElapsedMs}`) — they become structured property names; keep them stable since dashboards/queries depend on them.
- **Don't interpolate the message.** `Message = $"..."` defeats structured logging — pass values as parameters so each becomes a queryable field.
- **Guard expensive argument construction** with `IsEnabled` — the generated method guards the *logging*, but not the work you do to build its arguments:
  ```csharp
  if (logger.IsEnabled(LogLevel.Debug))
      Log.PayloadDump(logger, SerializeExpensively(request));
  ```
- **Assign stable `EventId`s** (and optionally `EventName`) per message — they identify events across structured sinks and make alerting precise.
- **Group log methods** in one `static partial class Log` per area for discoverability.
- Keep messages templated and constant — no string building in the `Message`.

---

## Method constraints

The generator requires the logging method to:
- be `partial` and return `void`;
- not be generic (generic support arrived in C# 13 / .NET 9);
- have a name and parameter names that don't start with `_`;
- not use `out`, `ref`, or `params` parameters;
- for the static form, take an `ILogger` parameter; for the instance form, the containing class must expose an `ILogger` field/property.

If a constraint is violated the generator emits a descriptive compile error (the `SYSLIB1xxx` diagnostics).

---

## Redaction of sensitive data

With `Microsoft.Extensions.Compliance.Redaction`, annotate parameters with a data-classification attribute and register a redactor — values are redacted before they reach any sink.

```csharp
[LoggerMessage(EventId = 6, Level = LogLevel.Information, Message = "Login for {User}")]
public static partial void Login(ILogger logger, [PrivateData] string user);
```

```csharp
services.AddRedaction(b => b.SetRedactor<StarRedactor>(new DataClassificationSet(MyTaxonomy.Private)));
```

Useful for keeping PII (emails, SSNs, tokens) out of logs without scrubbing at every call site.

Source: [Data redaction](https://learn.microsoft.com/en-us/dotnet/core/extensions/data-redaction)

---

## Migrating from LoggerMessage.Define

`LoggerMessage.Define<...>` (the manual delegate approach) is the pre-.NET-6 high-performance pattern. It still works but is verbose, capped at 6 parameters, and has no dynamic level. Prefer `[LoggerMessage]` on .NET 6+.

```csharp
// old — keep only on .NET Framework / Core 3.1
private static readonly Action<ILogger, string, Exception?> s_started =
    LoggerMessage.Define<string>(LogLevel.Information, new EventId(1, nameof(Started)),
        "Started job {JobName}");
public static void Started(this ILogger logger, string jobName) => s_started(logger, jobName, null);

// new — equivalent, one attribute
[LoggerMessage(EventId = 1, Level = LogLevel.Information, Message = "Started job {JobName}")]
public static partial void Started(this ILogger logger, string jobName);
```

Source: [High-performance logging](https://learn.microsoft.com/en-us/dotnet/core/extensions/logging/high-performance-logging)
