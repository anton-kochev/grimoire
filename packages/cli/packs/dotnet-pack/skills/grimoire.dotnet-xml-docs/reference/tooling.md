# Tooling & Doc Generation

How to enable, enforce, and publish XML documentation in a modern .NET project.

## Table of contents

- [MSBuild properties](#msbuild-properties)
- [Controlling CS1591](#controlling-cs1591)
- [DocFX (recommended)](#docfx-recommended)
- [GitHub Pages CI](#github-pages-ci)
- [Alternatives](#alternatives)

## MSBuild properties

Enable the documentation file (per project, or once in `Directory.Build.props`):

```xml
<PropertyGroup>
  <GenerateDocumentationFile>true</GenerateDocumentationFile>
</PropertyGroup>
```

`GenerateDocumentationFile=true` writes `$(AssemblyName).xml` to the output directory. The older `DocumentationFile` property still works if you need a custom path, but `GenerateDocumentationFile` is the recommended switch.

Ship the XML alongside the DLL (NuGet does this automatically when the file sits next to the assembly) so consumers get IntelliSense for your library.

## Controlling CS1591

With the doc file enabled, the compiler emits **CS1591** ("Missing XML comment for publicly visible type or member") for each undocumented public API.

Make it a hard gate:

```xml
<WarningsAsErrors>$(WarningsAsErrors);CS1591</WarningsAsErrors>
```

Silence it where docs don't apply — a non-public-API app, generated code, a test project:

```xml
<NoWarn>$(NoWarn);CS1591</NoWarn>
```

Or scope it narrowly in source:

```csharp
#pragma warning disable CS1591
// generated / intentionally undocumented region
#pragma warning restore CS1591
```

## DocFX (recommended)

[DocFX](https://dotnet.github.io/docfx/) is a .NET Foundation static-site generator that turns your compiled assemblies + XML comments (plus Markdown articles) into a browsable HTML site. It ships a **modern** template and supports custom templates.

Install and scaffold:

```bash
dotnet tool install -g docfx
docfx init --yes          # creates docfx.json + starter site
docfx docfx.json --serve  # build and preview at http://localhost:8080
```

Pipeline: a **metadata** stage reads assemblies/XML and produces API YAML; a **build** stage renders YAML + Markdown into static HTML (or JSON/PDF). Point `metadata.src` at your `.csproj`/`.sln` and DocFX extracts the API surface and merges your `<summary>`, `<param>`, `<remarks>`, `cref` links, etc.

> Note: Microsoft Learn itself no longer runs on DocFX, but the project remains actively maintained by the community under the .NET Foundation.

## GitHub Pages CI

Publish on every push to `main` with GitHub Actions:

```yaml
name: docs
on:
  push:
    branches: [main]
permissions:
  contents: read
  pages: write
  id-token: write
jobs:
  build-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-dotnet@v4
        with:
          dotnet-version: '9.0.x'
      - run: dotnet tool install -g docfx
      - run: docfx docfx.json
      - uses: actions/upload-pages-artifact@v3
        with:
          path: _site
      - uses: actions/deploy-pages@v4
```

(`docfx init` puts the generated site in `_site` by default.)

## Alternatives

- **Sandcastle / SHFB** ([SHFB](https://github.com/EWSoftware/SHFB)) — builds CHM/HTML Help and website output from managed assemblies + XML comments; GUI and command-line, with Visual Studio integration. Mature, Windows-centric.
- **Doxygen** ([doxygen](https://github.com/doxygen/doxygen)) — multi-language; generates HTML/LaTeX/PDF/man output and can extract structure from undocumented sources. Useful in polyglot repos.

All three consume the same `///`-generated XML, so good comments are portable across whichever generator a project picks.
