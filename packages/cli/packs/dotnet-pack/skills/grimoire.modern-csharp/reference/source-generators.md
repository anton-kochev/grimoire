# Source generators (zero runtime cost)

A source generator runs during compilation and emits ordinary C# that becomes part of your assembly. The payoff: no runtime reflection, faster startup, smaller working set, and full trimming / Native AOT compatibility. The pattern is always the same — an attribute marks a `partial` member, the generator writes the implementation, and you can read/step the generated `.g.cs`.

Compile-time logging (`[LoggerMessage]`) has its own file; this covers the rest.

## Contents

- [System.Text.Json — JsonSerializerContext](#systemtextjson--jsonserializercontext)
- [GeneratedRegex](#generatedregex)
- [OptionsValidator](#optionsvalidator)
- [LibraryImport (P/Invoke)](#libraryimport-pinvoke)
- [Enabling & gotchas](#enabling--gotchas)

---

## System.Text.Json — JsonSerializerContext

Declare a `partial` context that lists the types you (de)serialize. The generator emits their metadata and converters at compile time, so no reflection is needed at runtime.

```csharp
[JsonSourceGenerationOptions(
    PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase,
    DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull)]
[JsonSerializable(typeof(WeatherForecast))]
[JsonSerializable(typeof(List<WeatherForecast>))]
internal sealed partial class AppJsonContext : JsonSerializerContext;

// serialize / deserialize through the generated TypeInfo
string json = JsonSerializer.Serialize(forecast, AppJsonContext.Default.WeatherForecast);
var back   = JsonSerializer.Deserialize(json, AppJsonContext.Default.WeatherForecast);
```

Why use it:
- **~40% faster startup** and lower memory vs reflection-based serialization (measured in .NET 8).
- **AOT/trimming-safe** — no reflection means the trimmer can't break it.
- Two modes via `JsonSourceGenerationMode`: `Serialization` (fastest, write-only fast path), `Metadata` (read + write). Default generates both.

Tips:
- Compose contexts from different assemblies with `options.TypeInfoResolverChain.Add(OtherContext.Default)`.
- For string enums: `[JsonSourceGenerationOptions(UseStringEnumConverter = true)]` or a `[JsonConverter(typeof(JsonStringEnumConverter<T>))]` on the enum.
- In AOT apps, set `<JsonSerializerIsReflectionEnabledByDefault>false</JsonSerializerIsReflectionEnabledByDefault>` to fail fast if any type isn't registered.

Sources: [Source generation in System.Text.Json](https://learn.microsoft.com/en-us/dotnet/standard/serialization/system-text-json/source-generation) · [What's new in STJ in .NET 8](https://devblogs.microsoft.com/dotnet/system-text-json-in-dotnet-8/)

---

## GeneratedRegex

For any **compile-time-constant** pattern, `[GeneratedRegex]` emits a specialized, debuggable `Regex` at build time — the modern replacement for `RegexOptions.Compiled`.

```csharp
public sealed partial class Slug
{
    [GeneratedRegex(@"[^a-z0-9]+", RegexOptions.IgnoreCase)]
    private static partial Regex NonAlphanumeric();

    // C# 13 / .NET 9 also allows a partial property
    [GeneratedRegex(@"^\d{4}-\d{2}-\d{2}$")]
    public static partial Regex IsoDate { get; }

    public static string Of(string title) =>
        NonAlphanumeric().Replace(title.ToLowerInvariant(), "-").Trim('-');
}
```

Versus the runtime alternatives:
- **vs `new Regex(pattern)`**: no startup interpretation, throughput of compiled regex.
- **vs `RegexOptions.Compiled`**: no runtime IL emission (so it works under AOT), faster startup, and the generated matcher is human-readable C# you can step through.

The `SYSLIB1040`–`1049` analyzer suggests and auto-converts eligible `Regex` usages. Pattern must be a constant; for the rare `IgnoreCase` backreference case it falls back to a cached `Regex`.

Source: [Regex source generators](https://learn.microsoft.com/en-us/dotnet/standard/base-types/regular-expression-source-generators)

---

## OptionsValidator

Validate options classes without runtime reflection over DataAnnotations. Mark a `partial` validator and the generator writes the checks.

```csharp
public sealed class SmtpOptions
{
    [Required] public required string Host { get; init; }
    [Range(1, 65535)] public int Port { get; init; }
    [EmailAddress] public required string From { get; init; }
}

[OptionsValidator]
public sealed partial class ValidateSmtpOptions : IValidateOptions<SmtpOptions>;

// registration — fail fast at startup
builder.Services.AddOptions<SmtpOptions>()
    .Bind(builder.Configuration.GetSection("Smtp"))
    .ValidateOnStart();
builder.Services.AddSingleton<IValidateOptions<SmtpOptions>, ValidateSmtpOptions>();
```

Generated validation is strongly typed and AOT-safe (it substitutes reflection-free variants of `[Range]`, `[Length]`, etc.). Pair `required` with `[Required]` so misconfiguration is caught at both compile time and startup. Available in .NET 8+.

Source: [Options validation source generation](https://learn.microsoft.com/en-us/dotnet/core/extensions/options-validation-generator)

---

## LibraryImport (P/Invoke)

`[LibraryImport]` (.NET 7+) source-generates the native marshalling stub that `[DllImport]` used to build at runtime — making interop AOT-compatible and debuggable.

```csharp
internal static partial class Native
{
    [LibraryImport("mylib", EntryPoint = "to_upper", StringMarshalling = StringMarshalling.Utf8)]
    internal static partial string ToUpper(string input);
}
```

vs `[DllImport]`:
- Marshalling code lives in your assembly (steppable), not a runtime-generated IL stub.
- AOT/trimming-compatible; no runtime stub generation cost.
- String marshalling is explicit via `StringMarshalling` (prefer `Utf8`); calling convention via `[UnmanagedCallConv]`.
- Requires `<AllowUnsafeBlocks>true</AllowUnsafeBlocks>`. The `SYSLIB1054` analyzer converts `DllImport` automatically.

Source: [P/Invoke source generation](https://learn.microsoft.com/en-us/dotnet/standard/native-interop/pinvoke-source-generation)

---

## Enabling & gotchas

- **No opt-in for most**: referencing the package enables the generator — `Microsoft.Extensions.Logging` (`[LoggerMessage]`), `System.Text.Json` (`JsonSerializerContext`), the SDK itself (`[GeneratedRegex]`, `[LibraryImport]`), `Microsoft.Extensions.Options` (`[OptionsValidator]`).
- **Everything must be `partial`** — the class/method/property the generator completes, and (for instance forms) the containing type.
- **Inspect the output**: generated files show under *Dependencies → Analyzers* in the IDE, or write them to disk with `<EmitCompilerGeneratedFiles>true</EmitCompilerGeneratedFiles>`.
- **Turn on the analyzers** (`<AnalysisLevel>latest-recommended</AnalysisLevel>`): the `SYSLIB`/`CA` rules point you at every place a generator would help and often auto-fix it.
- **AOT/trimming**: these generators are what make `PublishAot` / `PublishTrimmed` viable — reflection-based equivalents are exactly what the trimmer can't see.

Sources: [Source generator diagnostics](https://learn.microsoft.com/en-us/dotnet/fundamentals/syslib-diagnostics/source-generator-overview) · [.NET source generators overview](https://learn.microsoft.com/en-us/dotnet/csharp/roslyn-sdk/source-generators-overview)
