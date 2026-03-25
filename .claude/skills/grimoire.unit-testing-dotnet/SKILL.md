---
name: grimoire.unit-testing-dotnet
description: "C#/.NET unit testing specialist. Framework selection, patterns, and best practices for xUnit, TUnit, NUnit, Moq, and NSubstitute. Use when writing tests for .cs files, configuring test projects, or asking about .NET testing patterns, mocking, assertions, async testing, FluentAssertions alternatives."
---

# .NET Unit Testing

Expert guidance for writing clean, maintainable unit tests in C#/.NET projects.

**Default Framework**: xUnit with xUnit Assert (safest, most universal, works with all .NET versions)
**Recommended for new .NET 8+ projects**: TUnit (modern, async-first, built-in fluent assertions, MIT license)

## Framework Selection

### Detection

1. Check existing test files first — always match what the project uses
2. Check `.csproj` for `TargetFramework` and test package references
3. Check for xUnit (`xunit`), TUnit (`TUnit`), NUnit (`NUnit`), MSTest (`MSTest.TestFramework`)

### Decision Table

| Condition | Use | Reason |
|-----------|-----|--------|
| Project has existing tests | **Match existing** | Consistency is paramount |
| New .NET 8+ greenfield | **Offer TUnit** | Modern, async-first, built-in assertions |
| New .NET 6/7 project | **xUnit** | TUnit requires .NET 8+ |
| .NET Framework project | **xUnit** | Universal compatibility |
| Project uses NUnit | **NUnit** | Match existing |
| Uncertain or mixed | **xUnit** | Safe default |

**For new .NET 8+ projects without existing tests:**
Offer the choice: "This is a new .NET 8+ project. I'll use **xUnit** (industry standard) by default. Would you prefer **TUnit** instead? TUnit offers built-in fluent assertions, async-first design, and better performance, but is newer."

**Note on FluentAssertions**: Version 8+ requires a commercial license ($130/dev/year). Avoid recommending it unless the project already uses it.

## Naming Conventions

Use `MethodName_Scenario_ExpectedBehavior` with PascalCase:

```csharp
// Pattern: MethodName_Scenario_ExpectedBehavior
ProcessOrder_WithValidOrder_ReturnsSuccess()
GetUser_WithNonExistentId_ThrowsUserNotFoundException()
CalculateDiscount_WhenOrderExceeds100_Returns10PercentOff()
```

## Patterns

### AAA with xUnit

```csharp
public class OrderServiceTests : IDisposable
{
    private readonly Mock<IOrderRepository> _mockRepo;
    private readonly FakeLogger<OrderService> _fakeLogger;
    private readonly OrderService _sut;

    public OrderServiceTests()
    {
        _mockRepo = new Mock<IOrderRepository>();
        _fakeLogger = new FakeLogger<OrderService>();
        _sut = new OrderService(_fakeLogger, _mockRepo.Object);
    }

    [Fact]
    public async Task ProcessOrder_WithValidOrder_ReturnsSuccess()
    {
        // Arrange
        var order = CreateValidOrder();
        _mockRepo.Setup(r => r.SaveAsync(It.IsAny<Order>()))
            .ReturnsAsync(new Order { Id = "123" });

        // Act
        var result = await _sut.ProcessOrderAsync(order);

        // Assert
        Assert.True(result.IsSuccess);
        Assert.Equal("123", result.Id);
    }

    public void Dispose() { /* cleanup if needed */ }
}
```

### AAA with TUnit

```csharp
public class OrderServiceTests
{
    private readonly Mock<IOrderRepository> _mockRepo = new();
    private readonly OrderService _sut;

    public OrderServiceTests()
    {
        _sut = new OrderService(_mockRepo.Object);
    }

    [Test]
    public async Task ProcessOrder_WithValidOrder_ReturnsSuccess()
    {
        // Arrange
        var order = CreateValidOrder();
        _mockRepo.Setup(r => r.SaveAsync(It.IsAny<Order>()))
            .ReturnsAsync(new Order { Id = "123" });

        // Act
        var result = await _sut.ProcessOrderAsync(order);

        // Assert — TUnit assertions are async and fluent
        await Assert.That(result.IsSuccess).IsTrue();
        await Assert.That(result.Id).IsEqualTo("123");
    }
}
```

### Parameterized Tests

```csharp
// xUnit
[Theory]
[InlineData(0, 100.0)]
[InlineData(10, 90.0)]
[InlineData(50, 50.0)]
public void ApplyDiscount_CalculatesCorrectly(int discount, double expected)
{
    Assert.Equal(expected, ApplyDiscount(100.0, discount));
}

// TUnit
[Test]
[Arguments(0, 100.0)]
[Arguments(10, 90.0)]
[Arguments(50, 50.0)]
public async Task ApplyDiscount_CalculatesCorrectly(int discount, double expected)
{
    await Assert.That(ApplyDiscount(100.0, discount)).IsEqualTo(expected);
}
```

### Error Testing

```csharp
// xUnit exception testing
[Fact]
public async Task ProcessOrder_WithNullOrder_ThrowsArgumentNullException()
{
    var exception = await Assert.ThrowsAsync<ArgumentNullException>(
        () => _sut.ProcessOrderAsync(null!));
    Assert.Equal("order", exception.ParamName);
}

// TUnit exception testing
[Test]
public async Task ProcessOrder_WithNullOrder_ThrowsArgumentNullException()
{
    var action = () => _sut.ProcessOrderAsync(null!);
    await Assert.That(action).ThrowsException()
        .OfType<ArgumentNullException>();
}
```

### FakeLogger for Logging Tests

```csharp
using Microsoft.Extensions.Logging.Testing;

var fakeLogger = new FakeLogger<OrderService>();
var sut = new OrderService(fakeLogger);
await sut.ProcessOrderAsync(orderId: 123);

var logEntry = fakeLogger.Collector.GetSnapshot()
    .Single(r => r.Level == LogLevel.Information);
var state = logEntry.StructuredState!.ToDictionary(x => x.Key, x => x.Value);
Assert.Equal("123", state["OrderId"]);
```

## Mocking

### Moq (default)

```csharp
var mockRepo = new Mock<IOrderRepository>();
mockRepo.Setup(r => r.GetByIdAsync(It.IsAny<Guid>(), It.IsAny<CancellationToken>()))
    .ReturnsAsync(expectedDocument);

// Verify
mockRepo.Verify(r => r.SaveAsync(It.IsAny<Order>()), Times.Once);
```

### NSubstitute

```csharp
var repo = Substitute.For<IOrderRepository>();
repo.GetByIdAsync(Arg.Any<Guid>(), Arg.Any<CancellationToken>())
    .Returns(expectedDocument);

// Verify
await repo.Received(1).SaveAsync(Arg.Any<Order>());
```

### What NOT to mock

- Value objects, records, DTOs
- Pure static methods with no side effects
- The class under test itself
- Simple data structures

Mock only at system boundaries: repositories, external APIs, file system, clock.

## File Conventions

- `Tests/` or `*.Tests/` project mirroring source structure
- `*Tests.cs` suffix for test classes
- Constructor for per-test setup (xUnit creates new instance per test)
- `IDisposable` for teardown
- `dotnet test` to run

## Package Setup

```bash
# xUnit (default)
dotnet add package xunit
dotnet add package xunit.runner.visualstudio
dotnet add package Microsoft.NET.Test.Sdk

# TUnit (for .NET 8+ projects)
dotnet add package TUnit

# Mocking
dotnet add package Moq
# or
dotnet add package NSubstitute

# Logging testing
dotnet add package Microsoft.Extensions.Logging.Testing
```

## Authoritative Sources

- xUnit: https://xunit.net
- TUnit: https://github.com/thomhurst/TUnit
- NUnit: https://nunit.org
- Moq: https://github.com/moq/moq4
- NSubstitute: https://nsubstitute.github.io
- Kent Beck — Canon TDD: https://tidyfirst.substack.com/p/canon-tdd
- Martin Fowler — Mocks Aren't Stubs: https://martinfowler.com/articles/mocksArentStubs.html

## Reference Materials

- **[Anti-Patterns](reference/anti-patterns.md)** — Common testing mistakes and how to fix them
- **[TDD Workflow Patterns](reference/tdd-workflow-patterns.md)** — Red-Green-Refactor, Transformation Priority Premise, when to use TDD
