# xUnit Test File Template

Standard template for xUnit test files.

## Basic Test Class Template

```csharp
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Testing;
using Moq;
using Xunit;

namespace YourProject.Tests.Services;

public class YourServiceTests : IDisposable
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

    public void Dispose()
    {
        // Cleanup resources if needed
    }

    #region MethodName Tests

    [Fact]
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
        Assert.NotNull(result);
        Assert.Equal(expected, result.Property);
    }

    [Fact]
    public async Task MethodName_WhenDependencyFails_ShouldThrowException()
    {
        // Arrange
        _mockDependency
            .Setup(d => d.GetDataAsync(It.IsAny<Guid>()))
            .ThrowsAsync(new InvalidOperationException("Dependency failed"));

        // Act & Assert
        await Assert.ThrowsAsync<ServiceException>(
            () => _sut.MethodNameAsync(CreateTestInput()));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public async Task MethodName_WithInvalidInput_ShouldThrowArgumentException(
        string? invalidInput)
    {
        // Act & Assert
        await Assert.ThrowsAsync<ArgumentException>(
            () => _sut.MethodNameAsync(invalidInput!));
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

## Async Lifecycle Template

For tests requiring async setup/teardown:

```csharp
public class DatabaseServiceTests : IAsyncLifetime
{
    private TestDatabase _database = null!;
    private readonly Mock<ILogger<DatabaseService>> _mockLogger;
    private DatabaseService _sut = null!;

    public DatabaseServiceTests()
    {
        _mockLogger = new Mock<ILogger<DatabaseService>>();
    }

    public async Task InitializeAsync()
    {
        _database = await TestDatabase.CreateAsync();
        _sut = new DatabaseService(_database.ConnectionString, _mockLogger.Object);
    }

    public async Task DisposeAsync()
    {
        await _database.DisposeAsync();
    }

    [Fact]
    public async Task Query_WithValidSql_ReturnsResults()
    {
        // Test using _database and _sut
    }
}
```

## Nested Class Organization Template

```csharp
public class OrderServiceTests : IDisposable
{
    private readonly Mock<IOrderRepository> _mockRepository;
    private readonly OrderService _sut;

    public OrderServiceTests()
    {
        _mockRepository = new Mock<IOrderRepository>();
        _sut = new OrderService(_mockRepository.Object);
    }

    public void Dispose() { }

    public class CreateOrder : OrderServiceTests
    {
        [Fact]
        public async Task WithValidOrder_ReturnsSuccessResult()
        {
            var order = new Order { /* ... */ };
            var result = await _sut.CreateOrderAsync(order);
            Assert.True(result.IsSuccess);
        }

        [Fact]
        public async Task WithNullOrder_ThrowsArgumentNullException()
        {
            await Assert.ThrowsAsync<ArgumentNullException>(
                () => _sut.CreateOrderAsync(null!));
        }
    }

    public class UpdateOrder : OrderServiceTests
    {
        [Fact]
        public async Task WithValidChanges_UpdatesSuccessfully()
        {
            // Tests for UpdateOrder
        }
    }
}
```

## Collection Fixture Template

For sharing expensive resources across test classes:

```csharp
// 1. Define the fixture
public class DatabaseFixture : IAsyncLifetime
{
    public TestDatabase Database { get; private set; } = null!;

    public async Task InitializeAsync()
    {
        Database = await TestDatabase.CreateAsync();
        await Database.SeedTestDataAsync();
    }

    public async Task DisposeAsync()
    {
        await Database.DisposeAsync();
    }
}

// 2. Define the collection
[CollectionDefinition("Database")]
public class DatabaseCollection : ICollectionFixture<DatabaseFixture> { }

// 3. Use in test classes
[Collection("Database")]
public class OrderRepositoryTests
{
    private readonly DatabaseFixture _fixture;

    public OrderRepositoryTests(DatabaseFixture fixture)
    {
        _fixture = fixture;
    }

    [Fact]
    public async Task GetById_ReturnsOrder()
    {
        // Use _fixture.Database
    }
}
```

## Parameterized Test Template

```csharp
public class CalculatorTests
{
    private readonly Calculator _sut = new();

    // Simple inline data
    [Theory]
    [InlineData(2, 3, 5)]
    [InlineData(-1, 1, 0)]
    [InlineData(0, 0, 0)]
    public void Add_WithValidInputs_ReturnsCorrectSum(int a, int b, int expected)
    {
        var result = _sut.Add(a, b);
        Assert.Equal(expected, result);
    }

    // Complex data from method
    [Theory]
    [MemberData(nameof(GetDivisionTestCases))]
    public void Divide_WithValidInputs_ReturnsCorrectResult(
        decimal numerator, decimal denominator, decimal expected, string scenario)
    {
        var result = _sut.Divide(numerator, denominator);
        Assert.Equal(expected, result);
    }

    public static IEnumerable<object[]> GetDivisionTestCases()
    {
        yield return new object[] { 10m, 2m, 5m, "Simple division" };
        yield return new object[] { 7m, 2m, 3.5m, "Division with decimal result" };
        yield return new object[] { -10m, 2m, -5m, "Negative numerator" };
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

    [Fact]
    public async Task ProcessOrder_LogsOrderId()
    {
        // Arrange
        var orderId = 123;

        // Act
        await _sut.ProcessOrderAsync(orderId);

        // Assert - Verify structured log properties
        var logEntry = _fakeLogger.Collector.GetSnapshot()
            .Single(r => r.Level == LogLevel.Information);

        Assert.NotNull(logEntry.StructuredState);
        var state = logEntry.StructuredState!.ToDictionary(x => x.Key, x => x.Value);

        Assert.True(state.ContainsKey("OrderId"));
        Assert.Equal("123", state["OrderId"]);
    }

    [Fact]
    public async Task ProcessOrder_WhenFails_LogsError()
    {
        // Arrange - setup to cause failure

        // Act
        await Assert.ThrowsAsync<Exception>(() => _sut.ProcessOrderAsync(-1));

        // Assert
        var errorLog = _fakeLogger.Collector.GetSnapshot()
            .SingleOrDefault(r => r.Level == LogLevel.Error);

        Assert.NotNull(errorLog);
    }
}
```
