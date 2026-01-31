# Framework Guidelines

Detailed guidelines for xUnit and TUnit testing frameworks.

## Table of Contents

- [xUnit Guidelines](#xunit-guidelines)
  - [Attributes](#xunit-attributes)
  - [Lifecycle](#xunit-lifecycle)
  - [Assertions](#xunit-assertions)
- [TUnit Guidelines](#tunit-guidelines)
  - [Attributes](#tunit-attributes)
  - [Lifecycle](#tunit-lifecycle)
  - [Assertions](#tunit-assertions)
  - [Assertion Chaining](#tunit-assertion-chaining)

---

## xUnit Guidelines

xUnit is the default framework for .NET testing. It uses constructor injection for test setup and implements `IDisposable` for cleanup.

### xUnit Attributes

| Attribute | Purpose |
| ----------- | --------- |
| `[Fact]` | Single test case |
| `[Theory]` | Parameterized test |
| `[InlineData]` | Simple inline test data |
| `[MemberData]` | Method-based test data |
| `[ClassData]` | Reusable test data class |
| `[Trait]` | Test categorization |
| `[Collection]` | Shared fixture across classes |

**Examples:**

```csharp
// Simple test
[Fact]
public async Task GetOrder_WithValidId_ReturnsOrder()
{
    var result = await _sut.GetOrderAsync(validId);
    Assert.NotNull(result);
}

// Parameterized test with inline data
[Theory]
[InlineData("", false)]
[InlineData("invalid", false)]
[InlineData("test@example.com", true)]
public void IsValidEmail_WithVariousInputs_ReturnsExpectedResult(string email, bool expected)
{
    var result = _sut.IsValidEmail(email);
    Assert.Equal(expected, result);
}

// Parameterized test with method data
[Theory]
[MemberData(nameof(GetOrderTestCases))]
public async Task ProcessOrder_WithVariousOrders_BehavesCorrectly(
    Order order, bool expectedSuccess, string expectedMessage)
{
    var result = await _sut.ProcessOrderAsync(order);
    Assert.Equal(expectedSuccess, result.Success);
}

public static IEnumerable<object[]> GetOrderTestCases()
{
    yield return new object[] { CreateValidOrder(), true, "Success" };
    yield return new object[] { CreateInvalidOrder(), false, "Invalid order" };
}
```

### xUnit Lifecycle

```csharp
public class OrderServiceTests : IDisposable
{
    // Fresh instances for each test via constructor
    private readonly Mock<IOrderRepository> _mockRepository;
    private readonly FakeLogger<OrderService> _fakeLogger;
    private readonly OrderService _sut;

    public OrderServiceTests()
    {
        _mockRepository = new Mock<IOrderRepository>();
        _fakeLogger = new FakeLogger<OrderService>();
        _sut = new OrderService(_fakeLogger, _mockRepository.Object);
    }

    public void Dispose()
    {
        // Cleanup if needed
    }
}
```

**Async Lifecycle:**

```csharp
public class DatabaseTests : IAsyncLifetime
{
    private TestDatabase _database;

    public async Task InitializeAsync()
    {
        _database = await TestDatabase.CreateAsync();
    }

    public async Task DisposeAsync()
    {
        await _database.CleanupAsync();
    }
}
```

### xUnit Assertions

```csharp
// Basic assertions
Assert.True(condition);
Assert.False(condition);
Assert.Null(value);
Assert.NotNull(value);
Assert.Equal(expected, actual);
Assert.NotEqual(expected, actual);

// Collection assertions
Assert.Empty(collection);
Assert.NotEmpty(collection);
Assert.Contains(item, collection);
Assert.DoesNotContain(item, collection);
Assert.All(collection, item => Assert.True(item.IsValid));
Assert.Single(collection);

// String assertions
Assert.StartsWith("prefix", value);
Assert.EndsWith("suffix", value);
Assert.Contains("substring", value);

// Exception assertions
await Assert.ThrowsAsync<ArgumentNullException>(() => _sut.MethodAsync(null));
var ex = await Assert.ThrowsAsync<CustomException>(() => _sut.MethodAsync(input));
Assert.Equal("expected message", ex.Message);

// Type assertions
Assert.IsType<ExpectedType>(value);
Assert.IsAssignableFrom<IInterface>(value);
```

---

## TUnit Guidelines

TUnit is recommended for new .NET 8+ projects. It's async-first with built-in fluent assertions.

### TUnit Attributes

| Attribute | Purpose | xUnit Equivalent |
| ----------- | --------- | ------------------ |
| `[Test]` | All test methods | `[Fact]` |
| `[Arguments]` | Inline test data | `[InlineData]` |
| `[MethodDataSource]` | Method-based data | `[MemberData]` |
| `[ClassDataSource]` | Reusable data class | `[ClassData]` |
| `[Matrix]` | Combinatorial testing | N/A (unique to TUnit) |
| `[Category]` | Test categorization | `[Trait]` |
| `[Timeout]` | Test timeout | N/A |
| `[Retry]` | Retry flaky tests | N/A |
| `[NotInParallel]` | Sequential execution | `[Collection]` |

**Examples:**

```csharp
// Simple test
[Test]
public async Task GetOrder_WithValidId_ReturnsOrder()
{
    var result = await _sut.GetOrderAsync(validId);
    await Assert.That(result).IsNotNull();
}

// Parameterized test with arguments
[Test]
[Arguments("", false)]
[Arguments("invalid", false)]
[Arguments("test@example.com", true)]
public async Task IsValidEmail_WithVariousInputs_ReturnsExpectedResult(string email, bool expected)
{
    var result = _sut.IsValidEmail(email);
    await Assert.That(result).IsEqualTo(expected);
}

// Parameterized test with method data source
[Test]
[MethodDataSource(nameof(GetOrderTestCases))]
public async Task ProcessOrder_WithVariousOrders_BehavesCorrectly(Order order, bool expectedSuccess)
{
    var result = await _sut.ProcessOrderAsync(order);
    await Assert.That(result.IsSuccess).IsEqualTo(expectedSuccess);
}

// TUnit supports tuples for cleaner syntax
public static IEnumerable<(Order, bool)> GetOrderTestCases()
{
    yield return (CreateValidOrder(), true);
    yield return (CreateInvalidOrder(), false);
}
```

### TUnit Lifecycle

```csharp
public class OrderServiceTests : IAsyncDisposable
{
    private readonly Mock<IOrderRepository> _mockRepository;
    private readonly FakeLogger<OrderService> _fakeLogger;
    private readonly OrderService _sut;

    public OrderServiceTests()
    {
        _mockRepository = new Mock<IOrderRepository>();
        _fakeLogger = new FakeLogger<OrderService>();
        _sut = new OrderService(_fakeLogger, _mockRepository.Object);
    }

    public ValueTask DisposeAsync()
    {
        // Cleanup if needed
        return ValueTask.CompletedTask;
    }
}
```

**Attribute-based Lifecycle:**

```csharp
public class DatabaseTests
{
    [Before(Test)]
    public async Task SetupBeforeEachTest() { }

    [After(Test)]
    public async Task CleanupAfterEachTest() { }

    [Before(Class)]
    public static async Task SetupBeforeAllTests() { }

    [After(Class)]
    public static async Task CleanupAfterAllTests() { }
}
```

### TUnit Assertions

All TUnit assertions are awaitable, providing better stack traces and true async behavior.

```csharp
// Basic assertions
await Assert.That(condition).IsTrue();
await Assert.That(condition).IsFalse();
await Assert.That(value).IsNull();
await Assert.That(value).IsNotNull();
await Assert.That(actual).IsEqualTo(expected);
await Assert.That(actual).IsNotEqualTo(expected);

// Collection assertions
await Assert.That(collection).IsEmpty();
await Assert.That(collection).IsNotEmpty();
await Assert.That(collection).Contains("item");
await Assert.That(collection).DoesNotContain("item");
await Assert.That(collection).HasCount(3);
await Assert.That(collection).IsEquivalentTo(expectedItems);

// String assertions
await Assert.That(message).StartsWith("Error:");
await Assert.That(message).EndsWith("failed");
await Assert.That(message).Contains("substring");

// Numeric assertions with tolerance
await Assert.That(result).IsEqualTo(expected).Within(0.001);
await Assert.That(timestamp).IsEqualTo(DateTime.Now).Within(TimeSpan.FromSeconds(1));

// Exception assertions
await Assert.That(() => _sut.GetOrderAsync(invalidId))
    .ThrowsException()
    .OfType<OrderNotFoundException>()
    .WithProperty(e => e.OrderId, invalidId);

// Type assertions
await Assert.That(value).IsTypeOf<ExpectedType>();
await Assert.That(value).IsAssignableTo<IInterface>();
```

### TUnit Assertion Chaining

TUnit allows fluent chaining with `.And`:

```csharp
// Chain multiple assertions
await Assert.That(result)
    .IsNotNull()
    .And.HasProperty(r => r.Items)
    .And.HasCount().GreaterThan(0);

// Numeric range
await Assert.That(result).IsGreaterThan(0);
await Assert.That(result).IsLessThan(1000);
await Assert.That(result).IsBetween(1, 100);
```

### TUnit-Specific Features

**Timeout:**

```csharp
[Test]
[Timeout(5000)]  // 5 seconds
public async Task LongRunningOperation_CompletesWithinTimeout()
{
    var result = await _sut.ProcessAsync();
    await Assert.That(result.IsSuccess).IsTrue();
}
```

**Retry:**

```csharp
[Test]
[Retry(3)]
public async Task OccasionallySlowTest()
{
    // Will retry up to 3 times if it fails
}
```

**Matrix Testing (Combinatorial):**

```csharp
// Tests all combinations: 3 sizes × 2 methods × 2 booleans = 12 tests
[Test]
[Matrix("Small", "Medium", "Large")]
[Matrix("Standard", "Express")]
[Matrix(true, false)]
public async Task CalculateShipping_MatrixTest(string size, string method, bool isInternational)
{
    var result = await _sut.CalculateShippingAsync(size, method, isInternational);
    await Assert.That(result).IsGreaterThan(0);
}
```

**Custom Display Names:**

```csharp
[Test]
[Arguments("", false, DisplayName = "Empty string should be invalid")]
[Arguments("test@example.com", true, DisplayName = "Standard email should be valid")]
public async Task IsValidEmail_WithDisplayNames(string email, bool expected)
{
    await Assert.That(_sut.IsValid(email)).IsEqualTo(expected);
}
```
