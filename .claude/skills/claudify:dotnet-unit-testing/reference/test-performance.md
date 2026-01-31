# Test Performance

Guidelines for optimizing test suite performance.

## Table of Contents

- [Why Performance Matters](#why-performance-matters)
- [Test Isolation for Parallel Execution](#test-isolation-for-parallel-execution)
- [Fixture Optimization](#fixture-optimization)
- [Async Test Performance](#async-test-performance)
- [Mock Performance](#mock-performance)
- [Database Test Performance](#database-test-performance)
- [Test Data Builders](#test-data-builders)
- [Measuring Performance](#measuring-performance)
- [Parallel Execution Decision Guide](#parallel-execution-decision-guide)
- [Performance Anti-Patterns](#performance-anti-patterns)

---

## Why Performance Matters

| Slow Tests Cause | Impact |
| ------------------ | -------- |
| Longer CI/CD pipelines | Delayed deployments, frustrated developers |
| Developers skip running tests locally | Bugs caught later, more expensive fixes |
| Test suite abandonment | Technical debt accumulates |
| Flaky tests (timeouts) | False negatives erode trust |

**Target benchmarks:**

- Unit tests: <100ms each, <10 seconds total for a module
- Integration tests: <1 second each where possible
- Full test suite: <5 minutes for CI feedback

---

## Test Isolation for Parallel Execution

Tests that are properly isolated can run in parallel safely, dramatically reducing execution time.

**Safe for parallel execution:**

```csharp
// Each test creates its own instance
public class OrderServiceTests
{
    [Fact]
    public async Task Test1()
    {
        var sut = new OrderService(new Mock<IRepo>().Object);  // Own instance
    }

    [Fact]
    public async Task Test2()
    {
        var sut = new OrderService(new Mock<IRepo>().Object);  // Own instance
    }
}
```

**Will fail randomly in parallel:**

```csharp
// BAD: Shared mutable state
public class OrderServiceTests
{
    private static List<Order> _orders = new();  // SHARED!
    private static int _counter = 0;              // SHARED!

    [Fact]
    public void Test1()
    {
        _orders.Add(new Order());  // Affects Test2!
        _counter++;
    }

    [Fact]
    public void Test2()
    {
        Assert.Empty(_orders);  // May fail if Test1 runs first!
    }
}
```

**What can be safely shared:**

| Safe to Share | Not Safe to Share |
| --------------- | ------------------- |
| Immutable data | Mutable collections |
| Configuration values | Counters, flags |
| Read-only test fixtures | Objects with state |
| Static helper methods | Static fields with state |
| Compiled regex patterns | Database connections (usually) |

---

## Fixture Optimization

### Class Fixture vs Collection Fixture

```csharp
// CLASS FIXTURE: Created once per test CLASS
public class OrderServiceTests : IClassFixture<DatabaseFixture>
{
    private readonly DatabaseFixture _fixture;

    public OrderServiceTests(DatabaseFixture fixture)
    {
        _fixture = fixture;  // Same instance for all tests in this class
    }
}

// COLLECTION FIXTURE: Created once per test COLLECTION (multiple classes)
[Collection("Database")]
public class OrderRepositoryTests { }

[Collection("Database")]
public class CustomerRepositoryTests { }
// Both classes share the SAME DatabaseFixture instance
```

| Approach | Fixture Created | Best For |
| ---------- | ----------------- | ---------- |
| No fixture (constructor) | Once per TEST | Fast, isolated unit tests |
| `IClassFixture<T>` | Once per CLASS | Moderate setup, single class |
| `ICollectionFixture<T>` | Once per COLLECTION | Expensive setup, multiple classes |

### Lazy Initialization Pattern

```csharp
public class ExpensiveFixture : IAsyncLifetime
{
    private TestDatabase? _database;
    private HttpClient? _httpClient;

    public TestDatabase Database => _database
        ?? throw new InvalidOperationException("Call InitializeDatabaseAsync first");

    public Task InitializeAsync() => Task.CompletedTask;  // Nothing eager

    public async Task InitializeDatabaseAsync()
    {
        _database ??= await TestDatabase.CreateAsync();
    }

    public async Task DisposeAsync()
    {
        if (_database != null) await _database.DisposeAsync();
        _httpClient?.Dispose();
    }
}

// Tests only initialize what they need
public class OrderTests : IClassFixture<ExpensiveFixture>
{
    private readonly ExpensiveFixture _fixture;

    public OrderTests(ExpensiveFixture fixture) => _fixture = fixture;

    [Fact]
    public async Task DatabaseTest()
    {
        await _fixture.InitializeDatabaseAsync();  // Only this test pays the cost
    }

    [Fact]
    public void FastUnitTest()
    {
        // Doesn't need database - doesn't pay initialization cost
    }
}
```

---

## Async Test Performance

**Correct:**

```csharp
// Proper async all the way down
[Fact]
public async Task ProcessOrder_Async_Correct()
{
    var result = await _sut.ProcessOrderAsync(order);
    Assert.True(result.IsSuccess);
}

// Parallel async operations when independent
[Fact]
public async Task MultipleOperations_RunInParallel()
{
    var task1 = _sut.GetOrderAsync(id1);
    var task2 = _sut.GetOrderAsync(id2);
    var task3 = _sut.GetOrderAsync(id3);

    var results = await Task.WhenAll(task1, task2, task3);

    Assert.All(results, r => Assert.NotNull(r));
}
```

**Avoid:**

```csharp
// BAD: Blocking on async - can deadlock
[Fact]
public void ProcessOrder_Blocking_Wrong()
{
    var result = _sut.ProcessOrderAsync(order).Result;  // BLOCKS!
}

// BAD: Unnecessary Task.Run - adds overhead
[Fact]
public async Task ProcessOrder_UnnecessaryTaskRun()
{
    var result = await Task.Run(() => _sut.ProcessOrderAsync(order));  // Unnecessary!
}
```

### Async Timeout Patterns

**xUnit:**

```csharp
[Fact]
public async Task LongRunningOperation_CompletesWithinTimeout()
{
    using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));
    var result = await _sut.ProcessAsync(cts.Token);
    Assert.True(result.IsSuccess);
}
```

**TUnit:**

```csharp
[Test]
[Timeout(5000)]  // 5 seconds
public async Task LongRunningOperation_CompletesWithinTimeout()
{
    var result = await _sut.ProcessAsync();
    await Assert.That(result.IsSuccess).IsTrue();
}
```

---

## Mock Performance

### Strict vs Loose Mocks

```csharp
// LOOSE MOCK (default) - Better performance, less brittle
var mock = new Mock<IRepository>();
mock.Setup(r => r.GetByIdAsync(It.IsAny<Guid>())).ReturnsAsync(entity);
// Unsetup methods return default values - no verification overhead

// STRICT MOCK - Slower, more brittle, use sparingly
var strictMock = new Mock<IRepository>(MockBehavior.Strict);
// EVERY call must be setup - throws on unexpected calls
```

### Efficient Mock Setup

```csharp
// SLOW: Creating new mock for every test case
[Theory]
[InlineData(1)]
[InlineData(2)]
public async Task Test(int id)
{
    var mock = new Mock<IRepository>();  // Created multiple times!
    mock.Setup(r => r.GetByIdAsync(id)).ReturnsAsync(new Entity { Id = id });
    var sut = new Service(mock.Object);
}

// FASTER: Reuse mock, configure per-test
public class ServiceTests
{
    private readonly Mock<IRepository> _mock = new();
    private readonly Service _sut;

    public ServiceTests()
    {
        _sut = new Service(_mock.Object);
    }

    [Theory]
    [InlineData(1)]
    [InlineData(2)]
    public async Task Test(int id)
    {
        _mock.Setup(r => r.GetByIdAsync(id)).ReturnsAsync(new Entity { Id = id });
        _mock.Reset();  // Clean up for next test if needed
    }
}
```

### Avoid Over-Verification

```csharp
// SLOW & BRITTLE: Verifying everything
[Fact]
public async Task ProcessOrder_OverVerified()
{
    await _sut.ProcessOrderAsync(order);

    _mockRepo.Verify(r => r.BeginTransactionAsync(), Times.Once);
    _mockRepo.Verify(r => r.GetByIdAsync(It.IsAny<Guid>()), Times.Once);
    _mockRepo.Verify(r => r.UpdateAsync(It.IsAny<Order>()), Times.Once);
    _mockRepo.Verify(r => r.SaveChangesAsync(), Times.Once);
    // 4+ verification calls - slow and tests implementation
}

// FAST & FOCUSED: Verify only what matters
[Fact]
public async Task ProcessOrder_Focused()
{
    await _sut.ProcessOrderAsync(order);

    _mockRepo.Verify(r => r.UpdateAsync(
        It.Is<Order>(o => o.Status == OrderStatus.Processed)),
        Times.Once);
}
```

---

## Database Test Performance

### Use Transactions for Isolation and Speed

```csharp
public class DatabaseTests : IAsyncLifetime
{
    private IDbContextTransaction _transaction = null!;
    private AppDbContext _context = null!;

    public async Task InitializeAsync()
    {
        _context = _db.CreateContext();
        _transaction = await _context.Database.BeginTransactionAsync();
    }

    public async Task DisposeAsync()
    {
        await _transaction.RollbackAsync();  // Fast cleanup - no data persisted
        await _transaction.DisposeAsync();
        await _context.DisposeAsync();
    }

    [Fact]
    public async Task CreateOrder_PersistsToDatabase()
    {
        var order = new Order { /* ... */ };
        _context.Orders.Add(order);
        await _context.SaveChangesAsync();

        var saved = await _context.Orders.FindAsync(order.Id);
        Assert.NotNull(saved);
        // Transaction rolls back - database unchanged for next test
    }
}
```

### In-Memory Database for Unit Tests

```csharp
public class OrderRepositoryTests
{
    private readonly AppDbContext _context;

    public OrderRepositoryTests()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())  // Unique per test
            .Options;

        _context = new AppDbContext(options);
    }

    [Fact]
    public async Task GetById_ReturnsOrder()
    {
        // In-memory - very fast, but not 100% SQL compatible
        _context.Orders.Add(new Order { Id = 1 });
        await _context.SaveChangesAsync();

        var result = await _context.Orders.FindAsync(1);
        Assert.NotNull(result);
    }
}
```

---

## Test Data Builders

### Builder Pattern

```csharp
public class OrderBuilder
{
    private int _id = 1;
    private string _orderNumber = "ORD-001";
    private OrderStatus _status = OrderStatus.Pending;
    private List<OrderItem> _items = new();
    private Customer? _customer;

    public OrderBuilder WithId(int id) { _id = id; return this; }
    public OrderBuilder WithStatus(OrderStatus status) { _status = status; return this; }
    public OrderBuilder WithItem(OrderItem item) { _items.Add(item); return this; }

    public Order Build() => new Order
    {
        Id = _id,
        OrderNumber = _orderNumber,
        Status = _status,
        Items = _items,
        Customer = _customer ?? new Customer { Name = "Default" }
    };
}

// Usage - only build what the test needs
[Fact]
public void Test_OnlyNeedsStatus()
{
    var order = new OrderBuilder()
        .WithStatus(OrderStatus.Shipped)
        .Build();
}
```

### Object Mother Pattern

```csharp
public static class TestOrders
{
    public static Order ValidPendingOrder => new Order
    {
        Id = 1,
        Status = OrderStatus.Pending,
        Items = { new OrderItem { ProductId = 1, Quantity = 1 } }
    };

    public static Order EmptyOrder => new Order { Id = 2 };

    public static Order CreateWithItems(int itemCount) => new Order
    {
        Items = Enumerable.Range(1, itemCount)
            .Select(i => new OrderItem { ProductId = i, Quantity = 1 })
            .ToList()
    };
}
```

---

## Measuring Performance

```bash
# Run tests with timing information
dotnet test --logger "console;verbosity=detailed"

# Output test results to TRX file for analysis
dotnet test --logger "trx;LogFileName=results.trx"
```

**xUnit - Filter slow tests:**

```csharp
[Fact]
[Trait("Speed", "Slow")]
public async Task SlowIntegrationTest() { }

// CI fast feedback: dotnet test --filter "Speed!=Slow"
```

**TUnit - Built-in timing:**

```csharp
[Test]
[Timeout(1000)]  // Fail if >1 second
public async Task ShouldBeFast() { }

[Test]
[Retry(3)]  // Retry flaky tests
public async Task OccasionallySlowTest() { }
```

---

## Parallel Execution Decision Guide

| Scenario | Parallel? | Reason |
| ---------- | ----------- | -------- |
| Pure unit tests (no I/O) | Yes | No shared state, fast |
| Tests with mocked dependencies | Yes | Mocks are isolated |
| In-memory database tests | Yes | Each gets unique DB name |
| Real database tests | Depends | Need transaction isolation |
| File system tests | Depends | Use unique temp directories |
| Tests modifying static state | No | Will interfere with each other |
| Tests using shared external service | No | Rate limits, state pollution |
| Tests with specific port requirements | No | Port conflicts |

### Configuring Parallel Execution

```csharp
// xUnit: xunit.runner.json
{
    "parallelizeAssembly": true,
    "parallelizeTestCollections": true,
    "maxParallelThreads": 0  // 0 = use all processors
}

// xUnit: Limit parallelism for resource-intensive tests
[assembly: CollectionBehavior(MaxParallelThreads = 4)]

// TUnit: Configure via attribute
[assembly: Parallelism(MaxConcurrency = 4)]
```

---

## Performance Anti-Patterns

```csharp
// ANTI-PATTERN: Thread.Sleep in tests
[Fact]
public async Task WaitForEvent_Wrong()
{
    _sut.TriggerEvent();
    Thread.Sleep(1000);  // Wastes 1 second!
    Assert.True(_sut.EventProcessed);
}

// CORRECT: Use async wait with timeout
[Fact]
public async Task WaitForEvent_Correct()
{
    _sut.TriggerEvent();
    await WaitForConditionAsync(() => _sut.EventProcessed, timeout: TimeSpan.FromSeconds(5));
    Assert.True(_sut.EventProcessed);
}

// ANTI-PATTERN: Creating database per test
[Fact]
public async Task Test1()
{
    var db = await TestDatabase.CreateAsync();  // 500ms+ per test!
}

// CORRECT: Share database via fixture
[Collection("Database")]
public class Tests
{
    public Tests(DatabaseFixture fixture) { }  // Created once for collection
}

// ANTI-PATTERN: Large test data for every test
[Fact]
public void ValidateOrder_ChecksName()
{
    var order = CreateFullOrderWith100Items();  // Only need Name!
    Assert.False(_sut.Validate(order with { Name = "" }));
}

// CORRECT: Minimal test data
[Fact]
public void ValidateOrder_ChecksName()
{
    var order = new Order { Name = "" };  // Only what's needed
    Assert.False(_sut.Validate(order));
}
```
