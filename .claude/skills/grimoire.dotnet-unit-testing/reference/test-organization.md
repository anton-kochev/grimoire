# Test Organization

Guidelines for organizing large test suites effectively.

## Table of Contents

- [Folder and Namespace Structure](#folder-and-namespace-structure)
- [File Naming Conventions](#file-naming-conventions)
- [Nested Classes for Organization](#nested-classes-for-organization)
- [Test Categories and Traits](#test-categories-and-traits)
- [Test Collections and Shared Fixtures](#test-collections-and-shared-fixtures)
- [Controlling Parallel Execution](#controlling-parallel-execution)
- [Project Structure for Large Solutions](#project-structure-for-large-solutions)
- [When to Split Test Projects](#when-to-split-test-projects)

---

## Folder and Namespace Structure

Mirror your source code structure in the test project:

```plain
src/
├── MyApp.Domain/
│   ├── Entities/
│   │   └── Order.cs
│   └── Services/
│       ├── OrderService.cs
│       └── PaymentService.cs
├── MyApp.Infrastructure/
│   └── Repositories/
│       └── OrderRepository.cs
└── MyApp.Api/
    └── Controllers/
        └── OrderController.cs

tests/
├── MyApp.Domain.Tests/
│   ├── Entities/
│   │   └── OrderTests.cs
│   └── Services/
│       ├── OrderServiceTests.cs
│       └── PaymentServiceTests.cs
├── MyApp.Infrastructure.Tests/
│   └── Repositories/
│       └── OrderRepositoryTests.cs
└── MyApp.Api.Tests/
    └── Controllers/
        └── OrderControllerTests.cs
```

---

## File Naming Conventions

| Source File | Test File | Pattern |
| ------------- | ----------- | --------- |
| `OrderService.cs` | `OrderServiceTests.cs` | `{ClassName}Tests.cs` |
| `IOrderRepository.cs` | `OrderRepositoryTests.cs` | Test the implementation, not interface |
| `OrderValidator.cs` | `OrderValidatorTests.cs` | `{ClassName}Tests.cs` |

---

## Nested Classes for Organization

Use nested classes to group related tests within a single test file.

### xUnit - Nested Classes

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

    // Group tests by method being tested
    public class CreateOrder : OrderServiceTests
    {
        [Fact]
        public async Task WithValidOrder_ReturnsSuccessResult()
        {
            // Inherits _sut and _mockRepository from parent
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

        [Fact]
        public async Task WithDuplicateOrderNumber_ThrowsConflictException()
        {
            _mockRepository.Setup(r => r.ExistsAsync(It.IsAny<string>()))
                .ReturnsAsync(true);

            await Assert.ThrowsAsync<ConflictException>(
                () => _sut.CreateOrderAsync(new Order { OrderNumber = "ORD-001" }));
        }
    }

    public class UpdateOrder : OrderServiceTests
    {
        [Fact]
        public async Task WithValidChanges_UpdatesSuccessfully() { }

        [Fact]
        public async Task WithNonExistentOrder_ThrowsNotFoundException() { }
    }
}
```

### TUnit - Nested Classes

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
}
```

**Test Output with Nested Classes:**

```plain
OrderServiceTests+CreateOrder.WithValidOrder_ReturnsSuccessResult ✓
OrderServiceTests+CreateOrder.WithNullOrder_ThrowsArgumentNullException ✓
OrderServiceTests+UpdateOrder.WithValidChanges_UpdatesSuccessfully ✓
```

### Alternative: Region-Based Organization

For simpler cases, use `#region` to organize tests:

```csharp
public class OrderServiceTests : IDisposable
{
    private readonly OrderService _sut;

    public OrderServiceTests()
    {
        _sut = new OrderService(/* ... */);
    }

    public void Dispose() { }

    #region CreateOrder Tests

    [Fact]
    public async Task CreateOrder_WithValidData_ReturnsSuccess() { }

    [Fact]
    public async Task CreateOrder_WithNullOrder_ThrowsArgumentNullException() { }

    #endregion

    #region UpdateOrder Tests

    [Fact]
    public async Task UpdateOrder_WithValidChanges_UpdatesSuccessfully() { }

    #endregion

    #region Test Helpers

    private static Order CreateValidOrder() => new Order { /* ... */ };

    #endregion
}
```

**When to use each:**

- **Nested Classes**: Different setup/teardown needs, shared state within group, better test explorer grouping
- **Regions**: Same setup for all tests, simpler structure, IDE collapsibility

---

## Test Categories and Traits

### xUnit - Traits

```csharp
public class OrderServiceTests
{
    [Fact]
    [Trait("Category", "Unit")]
    public async Task CreateOrder_WithValidData_Succeeds() { }

    [Fact]
    [Trait("Category", "Integration")]
    [Trait("Database", "Required")]
    public async Task CreateOrder_PersistsToDatabase() { }

    [Fact]
    [Trait("Category", "Slow")]
    public async Task ProcessBulkOrders_HandlesLargeDataset() { }

    [Fact]
    [Trait("Bug", "JIRA-1234")]
    public async Task CreateOrder_WithSpecialCharacters_DoesNotFail() { }
}

// Run specific categories:
// dotnet test --filter "Category=Unit"
// dotnet test --filter "Category!=Slow"
// dotnet test --filter "Bug=JIRA-1234"
```

### TUnit - Categories

```csharp
public class OrderServiceTests
{
    [Test]
    [Category("Unit")]
    public async Task CreateOrder_WithValidData_Succeeds() { }

    [Test]
    [Category("Integration")]
    [Category("Database")]
    public async Task CreateOrder_PersistsToDatabase() { }

    [Test]
    [Property("Bug", "JIRA-1234")]
    public async Task CreateOrder_WithSpecialCharacters_DoesNotFail() { }
}
```

### Common Category Conventions

```csharp
[Trait("Category", "Unit")]         // Fast, isolated, no external dependencies
[Trait("Category", "Integration")]  // Requires external resources (DB, API)
[Trait("Category", "E2E")]          // End-to-end tests
[Trait("Category", "Smoke")]        // Quick sanity checks for deployments
[Trait("Category", "Slow")]         // Tests that take >1 second
[Trait("Category", "Flaky")]        // Known intermittent failures

// CI/CD pipeline examples:
// PR builds:        dotnet test --filter "Category=Unit"
// Nightly builds:   dotnet test --filter "Category=Unit|Category=Integration"
// Release builds:   dotnet test (all tests)
```

---

## Test Collections and Shared Fixtures

### xUnit - Collections for Shared Context

Use collections when multiple test classes share expensive setup:

```csharp
// 1. Define the shared fixture
public class DatabaseFixture : IAsyncLifetime
{
    public TestDatabase Database { get; private set; } = null!;
    public string ConnectionString => Database.ConnectionString;

    public async Task InitializeAsync()
    {
        Database = await TestDatabase.CreateAsync();
        await Database.MigrateAsync();
        await Database.SeedTestDataAsync();
    }

    public async Task DisposeAsync()
    {
        await Database.DisposeAsync();
    }
}

// 2. Define the collection
[CollectionDefinition("Database")]
public class DatabaseCollection : ICollectionFixture<DatabaseFixture>
{
    // Marker class, no code needed
}

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
    public async Task GetById_WithExistingOrder_ReturnsOrder()
    {
        using var context = new AppDbContext(_fixture.ConnectionString);
        var repo = new OrderRepository(context);

        var result = await repo.GetByIdAsync(TestData.ExistingOrderId);

        Assert.NotNull(result);
    }
}

[Collection("Database")]
public class CustomerRepositoryTests
{
    private readonly DatabaseFixture _fixture;

    public CustomerRepositoryTests(DatabaseFixture fixture)
    {
        _fixture = fixture;
        // Same database instance shared across both test classes
    }
}
```

### TUnit - ClassDataSource for Shared Fixtures

```csharp
public class DatabaseFixture : IAsyncInitializable, IAsyncDisposable
{
    public TestDatabase Database { get; private set; } = null!;

    public async Task InitializeAsync()
    {
        Database = await TestDatabase.CreateAsync();
        await Database.MigrateAsync();
    }

    public async ValueTask DisposeAsync()
    {
        await Database.DisposeAsync();
    }
}

public class OrderRepositoryTests
{
    [Test]
    [ClassDataSource<DatabaseFixture>(Shared = SharedType.Globally)]
    public async Task GetById_WithExistingOrder_ReturnsOrder(DatabaseFixture fixture)
    {
        using var context = new AppDbContext(fixture.Database.ConnectionString);
        var repo = new OrderRepository(context);

        var result = await repo.GetByIdAsync(TestData.ExistingOrderId);

        await Assert.That(result).IsNotNull();
    }
}
```

---

## Controlling Parallel Execution

### xUnit

```csharp
// Disable for entire assembly (AssemblyInfo.cs)
[assembly: CollectionBehavior(DisableTestParallelization = true)]

// Limit parallel threads
[assembly: CollectionBehavior(MaxParallelThreads = 4)]

// Disable for specific collection
[CollectionDefinition("Sequential", DisableParallelization = true)]
public class SequentialCollection { }

[Collection("Sequential")]
public class TestsThatCannotRunInParallel { }
```

### TUnit

```csharp
// Sequential within a class
[NotInParallel]
public class SequentialTests { }

// Named parallel group (tests in same group run sequentially)
[ParallelGroup("DatabaseTests")]
public class OrderRepositoryTests { }

[ParallelGroup("DatabaseTests")]
public class CustomerRepositoryTests { }

// Custom parallelism limit
[ParallelLimiter<MaxParallel3>]
public class ResourceIntensiveTests { }

public class MaxParallel3 : IParallelLimit
{
    public int Limit => 3;
}
```

---

## Project Structure for Large Solutions

```plain
tests/
├── Unit/
│   ├── MyApp.Domain.Tests/           # Domain logic unit tests
│   ├── MyApp.Application.Tests/      # Application/use case tests
│   └── MyApp.Api.Tests/              # Controller unit tests
│
├── Integration/
│   ├── MyApp.Infrastructure.Tests/   # Repository, external service tests
│   └── MyApp.Api.Integration.Tests/  # API tests with real database
│
├── E2E/
│   └── MyApp.E2E.Tests/              # Full end-to-end tests
│
└── Shared/
    └── MyApp.Tests.Common/           # Shared fixtures, builders, utilities
        ├── Fixtures/
        │   ├── DatabaseFixture.cs
        │   └── ApiFixture.cs
        ├── Builders/
        │   ├── OrderBuilder.cs
        │   └── CustomerBuilder.cs
        └── Extensions/
            └── AssertionExtensions.cs
```

---

## When to Split Test Projects

| Scenario | Recommendation |
| ---------- | ---------------- |
| <500 tests total | Single test project per source project |
| 500-2000 tests | Split Unit vs Integration |
| >2000 tests | Split by test type AND by domain area |
| Different test runners needed | Separate projects |
| Different framework versions | Separate projects |
