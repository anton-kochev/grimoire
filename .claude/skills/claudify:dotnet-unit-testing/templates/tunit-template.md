# TUnit Test File Template

Standard template for TUnit test files (recommended for .NET 8+ projects).

## Basic Test Class Template

```csharp
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Testing;
using Moq;
using TUnit.Core;
using TUnit.Assertions;
using TUnit.Assertions.Extensions;

namespace YourProject.Tests.Services;

public class YourServiceTests : IAsyncDisposable
{
    private readonly FakeLogger<YourService> _fakeLogger;
    private readonly Mock<IDependency> _mockDependency;
    private readonly YourService _sut; // System Under Test

    public YourServiceTests()
    {
        _fakeLogger = new FakeLogger<YourService>();
        _mockDependency = new Mock<IDependency>();
        _sut = new YourService(_fakeLogger, _mockDependency.Object);
    }

    public ValueTask DisposeAsync()
    {
        // Cleanup resources if needed
        return ValueTask.CompletedTask;
    }

    #region MethodName Tests

    [Test]
    public async Task MethodName_WhenConditionIsTrue_ShouldReturnExpectedResult()
    {
        // Arrange
        var input = CreateTestInput();
        _mockDependency
            .Setup(d => d.GetDataAsync(It.IsAny<Guid>()))
            .ReturnsAsync(expectedData);

        // Act
        var result = await _sut.MethodNameAsync(input);

        // Assert
        await Assert.That(result).IsNotNull();
        await Assert.That(result.Property).IsEqualTo(expected);
    }

    [Test]
    public async Task MethodName_WhenDependencyFails_ShouldThrowException()
    {
        // Arrange
        _mockDependency
            .Setup(d => d.GetDataAsync(It.IsAny<Guid>()))
            .ThrowsAsync(new InvalidOperationException("Dependency failed"));

        // Act & Assert
        await Assert.That(() => _sut.MethodNameAsync(CreateTestInput()))
            .ThrowsException()
            .OfType<ServiceException>();
    }

    [Test]
    [Arguments(null)]
    [Arguments("")]
    [Arguments("   ")]
    public async Task MethodName_WithInvalidInput_ShouldThrowArgumentException(
        string? invalidInput)
    {
        // Act & Assert
        await Assert.That(() => _sut.MethodNameAsync(invalidInput!))
            .ThrowsException()
            .OfType<ArgumentException>();
    }

    #endregion

    #region Test Helpers

    private static TestInput CreateTestInput() => new TestInput
    {
        Id = Guid.NewGuid(),
        Name = "Test Name",
        CreatedAt = DateTime.UtcNow
    };

    #endregion
}
```

## Attribute-Based Lifecycle Template

TUnit supports attribute-based setup and teardown:

```csharp
public class DatabaseServiceTests
{
    private TestDatabase _database = null!;
    private readonly Mock<ILogger<DatabaseService>> _mockLogger;
    private DatabaseService _sut = null!;

    public DatabaseServiceTests()
    {
        _mockLogger = new Mock<ILogger<DatabaseService>>();
    }

    [Before(Test)]
    public async Task SetupBeforeEachTest()
    {
        _database = await TestDatabase.CreateAsync();
        _sut = new DatabaseService(_database.ConnectionString, _mockLogger.Object);
    }

    [After(Test)]
    public async Task CleanupAfterEachTest()
    {
        await _database.DisposeAsync();
    }

    [Before(Class)]
    public static async Task SetupBeforeAllTests()
    {
        // One-time setup for all tests in class
    }

    [After(Class)]
    public static async Task CleanupAfterAllTests()
    {
        // One-time cleanup after all tests in class
    }

    [Test]
    public async Task Query_WithValidSql_ReturnsResults()
    {
        // Test using _database and _sut
    }
}
```

## Nested Class Organization Template

```csharp
public class OrderServiceTests : IAsyncDisposable
{
    protected readonly Mock<IOrderRepository> _mockRepository;
    protected readonly OrderService _sut;

    public OrderServiceTests()
    {
        _mockRepository = new Mock<IOrderRepository>();
        _sut = new OrderService(_mockRepository.Object);
    }

    public ValueTask DisposeAsync() => ValueTask.CompletedTask;

    public class CreateOrder : OrderServiceTests
    {
        [Test]
        public async Task WithValidOrder_ReturnsSuccessResult()
        {
            var order = new Order { /* ... */ };
            var result = await _sut.CreateOrderAsync(order);
            await Assert.That(result.IsSuccess).IsTrue();
        }

        [Test]
        public async Task WithNullOrder_ThrowsArgumentNullException()
        {
            await Assert.That(() => _sut.CreateOrderAsync(null!))
                .ThrowsException()
                .OfType<ArgumentNullException>();
        }
    }

    public class UpdateOrder : OrderServiceTests
    {
        [Test]
        public async Task WithValidChanges_UpdatesSuccessfully()
        {
            // Tests for UpdateOrder
        }
    }
}
```

## ClassDataSource Fixture Template

For sharing expensive resources:

```csharp
// 1. Define the fixture
public class DatabaseFixture : IAsyncInitializable, IAsyncDisposable
{
    public TestDatabase Database { get; private set; } = null!;

    public async Task InitializeAsync()
    {
        Database = await TestDatabase.CreateAsync();
        await Database.SeedTestDataAsync();
    }

    public async ValueTask DisposeAsync()
    {
        await Database.DisposeAsync();
    }
}

// 2. Use in test classes with ClassDataSource
public class OrderRepositoryTests
{
    [Test]
    [ClassDataSource<DatabaseFixture>(Shared = SharedType.Globally)]
    public async Task GetById_ReturnsOrder(DatabaseFixture fixture)
    {
        using var context = new AppDbContext(fixture.Database.ConnectionString);
        var repo = new OrderRepository(context);

        var result = await repo.GetByIdAsync(TestData.ExistingOrderId);

        await Assert.That(result).IsNotNull();
    }
}
```

## Parameterized Test Template

```csharp
public class CalculatorTests
{
    private readonly Calculator _sut = new();

    // Simple arguments
    [Test]
    [Arguments(2, 3, 5)]
    [Arguments(-1, 1, 0)]
    [Arguments(0, 0, 0)]
    public async Task Add_WithValidInputs_ReturnsCorrectSum(int a, int b, int expected)
    {
        var result = _sut.Add(a, b);
        await Assert.That(result).IsEqualTo(expected);
    }

    // With display names for clarity
    [Test]
    [Arguments(10, 2, 5, DisplayName = "Simple division")]
    [Arguments(7, 2, 3.5, DisplayName = "Division with decimal result")]
    [Arguments(-10, 2, -5, DisplayName = "Negative numerator")]
    public async Task Divide_WithValidInputs_ReturnsCorrectResult(
        decimal numerator, decimal denominator, decimal expected)
    {
        var result = _sut.Divide(numerator, denominator);
        await Assert.That(result).IsEqualTo(expected);
    }

    // Method data source with tuples
    [Test]
    [MethodDataSource(nameof(GetComplexTestCases))]
    public async Task Process_WithComplexInput_ReturnsExpected(
        Order order, bool expectedSuccess)
    {
        var result = await _sut.ProcessAsync(order);
        await Assert.That(result.IsSuccess).IsEqualTo(expectedSuccess);
    }

    public static IEnumerable<(Order, bool)> GetComplexTestCases()
    {
        yield return (CreateValidOrder(), true);
        yield return (CreateInvalidOrder(), false);
    }

    // Matrix testing - all combinations
    [Test]
    [Matrix("Small", "Medium", "Large")]
    [Matrix("Standard", "Express")]
    [Matrix(true, false)]
    public async Task CalculateShipping_ReturnsValidPrice(
        string size, string method, bool isInternational)
    {
        var result = await _sut.CalculateShippingAsync(size, method, isInternational);
        await Assert.That(result).IsGreaterThan(0);
    }
}
```

## Logger Testing Template

```csharp
public class ServiceWithLoggingTests
{
    private readonly FakeLogger<MyService> _fakeLogger;
    private readonly MyService _sut;

    public ServiceWithLoggingTests()
    {
        _fakeLogger = new FakeLogger<MyService>();
        _sut = new MyService(_fakeLogger);
    }

    [Test]
    public async Task ProcessOrder_LogsOrderId()
    {
        // Arrange
        var orderId = 123;

        // Act
        await _sut.ProcessOrderAsync(orderId);

        // Assert - Verify structured log properties
        var logEntry = _fakeLogger.Collector.GetSnapshot()
            .Single(r => r.Level == LogLevel.Information);

        await Assert.That(logEntry.StructuredState).IsNotNull();
        var state = logEntry.StructuredState!.ToDictionary(x => x.Key, x => x.Value);

        await Assert.That(state).ContainsKey("OrderId");
        await Assert.That(state["OrderId"]).IsEqualTo("123");
    }

    [Test]
    public async Task ProcessOrder_WhenFails_LogsError()
    {
        // Act
        await Assert.That(() => _sut.ProcessOrderAsync(-1))
            .ThrowsException();

        // Assert
        var errorLog = _fakeLogger.Collector.GetSnapshot()
            .SingleOrDefault(r => r.Level == LogLevel.Error);

        await Assert.That(errorLog).IsNotNull();
    }
}
```

## Fluent Assertion Chaining Template

```csharp
[Test]
public async Task ComplexResult_MeetsAllExpectations()
{
    var result = await _sut.ProcessAsync(input);

    // Chain multiple assertions
    await Assert.That(result)
        .IsNotNull()
        .And.HasProperty(r => r.Items)
        .And.HasCount().GreaterThan(0);

    // Collection assertions
    await Assert.That(result.Items).HasCount(3);
    await Assert.That(result.Items).Contains(expectedItem);
    await Assert.That(result.Items).IsEquivalentTo(expectedItems);

    // String assertions
    await Assert.That(result.Message).StartsWith("Success:");
    await Assert.That(result.Message).Contains("processed");

    // Numeric assertions with tolerance
    await Assert.That(result.Total).IsEqualTo(expected).Within(0.001);
    await Assert.That(result.ProcessedAt)
        .IsEqualTo(DateTime.UtcNow)
        .Within(TimeSpan.FromSeconds(1));
}
```

## Timeout and Retry Template

```csharp
public class ResilientTests
{
    [Test]
    [Timeout(5000)]  // 5 seconds max
    public async Task LongRunningOperation_CompletesWithinTimeout()
    {
        var result = await _sut.SlowOperationAsync();
        await Assert.That(result).IsNotNull();
    }

    [Test]
    [Retry(3)]  // Retry up to 3 times if fails
    public async Task FlakeyExternalService_EventuallySucceeds()
    {
        var result = await _sut.CallExternalServiceAsync();
        await Assert.That(result.IsSuccess).IsTrue();
    }

    [Test]
    [Timeout(10000)]
    [Retry(2)]
    public async Task CombinedTimeoutAndRetry()
    {
        // Has 10 seconds to complete, will retry twice on failure
        var result = await _sut.UnreliableOperationAsync();
        await Assert.That(result).IsNotNull();
    }
}
```

## Parallel Control Template

```csharp
// Tests that must run sequentially
[NotInParallel]
public class SequentialTests
{
    [Test]
    public async Task Test1_ModifiesSharedResource() { }

    [Test]
    public async Task Test2_AlsoModifiesSharedResource() { }
}

// Tests that share a parallel group (run sequentially within group)
[ParallelGroup("Database")]
public class OrderRepositoryTests { }

[ParallelGroup("Database")]
public class CustomerRepositoryTests { }

// Custom parallel limit
[ParallelLimiter<MaxParallel3>]
public class ResourceIntensiveTests
{
    [Test]
    public async Task Test1() { }
}

public class MaxParallel3 : IParallelLimit
{
    public int Limit => 3;
}
```
