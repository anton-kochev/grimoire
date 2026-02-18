# Anti-Patterns to Avoid

Common testing mistakes and how to fix them.

## Table of Contents

- [Mock Implementation in TDD](#mock-implementation-in-tdd)
- [Over-Specification](#over-specification)
- [Blocking on Async](#blocking-on-async)
- [Shared Mutable State](#shared-mutable-state)
- [Testing Implementation Details](#testing-implementation-details)
- [Vague Assertions](#vague-assertions)
- [Summary Checklist](#summary-checklist)

---

## Mock Implementation in TDD

**Don't**: Create mock/stub implementations during TDD before the real implementation exists.

```csharp
// BAD: Creating a fake implementation to make tests pass
public class FakeDocumentService : IDocumentService
{
    public Task<Document> GetAsync(Guid id) => Task.FromResult(new Document());
}
```

**Why it's wrong**: In TDD, tests should FAIL first against non-existent functionality. Creating fake implementations defeats the purpose of TDD and doesn't verify the real code.

**Instead**: Write the test, verify it fails (because the implementation doesn't exist), THEN implement the real code.

```csharp
// CORRECT TDD approach:
// 1. Write the test
[Fact]
public async Task GetDocument_WithValidId_ReturnsDocument()
{
    var result = await _sut.GetDocumentAsync(validId);
    Assert.NotNull(result);
}

// 2. Run test - it FAILS (method not implemented)
// 3. Implement the REAL code in DocumentService
// 4. Run test - it PASSES
```

---

## Over-Specification

**Don't**: Verify every single mock interaction.

```csharp
// BAD: Over-specified test - brittle and tests implementation, not behavior
[Fact]
public async Task ProcessOrder_ShouldCallAllDependencies()
{
    await _sut.ProcessOrderAsync(order);

    _mockRepo.Verify(r => r.GetByIdAsync(It.IsAny<Guid>()), Times.Once);
    _mockRepo.Verify(r => r.SaveAsync(It.IsAny<Order>()), Times.Once);
    _mockValidator.Verify(v => v.ValidateAsync(It.IsAny<Order>()), Times.Once);
    _mockLogger.Verify(l => l.Log(It.IsAny<LogLevel>(), /*...*/), Times.Exactly(3));
    _mockNotifier.Verify(n => n.SendAsync(It.IsAny<Notification>()), Times.Once);
}
```

**Why it's wrong**: Tests become brittle, break on any refactoring, and test implementation details rather than behavior.

**Instead**: Only verify interactions that are essential to the test's behavioral purpose.

```csharp
// CORRECT: Verify only essential outcomes
[Fact]
public async Task ProcessOrder_WithValidOrder_SavesOrderWithProcessedStatus()
{
    await _sut.ProcessOrderAsync(order);

    // Only verify the essential behavioral outcome
    _mockRepo.Verify(r => r.SaveAsync(
        It.Is<Order>(o => o.Status == OrderStatus.Processed)),
        Times.Once);
}
```

---

## Blocking on Async

**Don't**: Use `.Result` or `.Wait()` on async operations.

```csharp
// BAD: Blocking on async - can deadlock, hides async behavior
[Fact]
public void GetOrder_ShouldReturnOrder()
{
    var result = _sut.GetOrderAsync(id).Result;  // WRONG
    Assert.NotNull(result);
}

// ALSO BAD
[Fact]
public void GetOrder_ShouldReturnOrder()
{
    _sut.GetOrderAsync(id).Wait();  // WRONG
}
```

**Why it's wrong**: Can cause deadlocks, doesn't test true async behavior, and hides potential async issues.

**Instead**: Use `async Task` and `await`.

```csharp
// CORRECT
[Fact]
public async Task GetOrder_ShouldReturnOrder()
{
    var result = await _sut.GetOrderAsync(id);
    Assert.NotNull(result);
}
```

---

## Shared Mutable State

**Don't**: Share mutable state between tests.

```csharp
// BAD: Static shared state causes test pollution
public class OrderServiceTests
{
    private static List<Order> _orders = new List<Order>();  // WRONG
    private static Mock<IRepository> _sharedMock = new Mock<IRepository>();  // WRONG
    private static int _testCounter = 0;  // WRONG

    [Fact]
    public void Test1()
    {
        _orders.Add(new Order());  // Affects other tests!
        _testCounter++;
    }

    [Fact]
    public void Test2()
    {
        Assert.Empty(_orders);  // May fail if Test1 runs first!
    }
}
```

**Why it's wrong**: Tests become order-dependent, can't run in parallel, and failures are hard to diagnose.

**Instead**: Create fresh instances in the constructor for each test.

```csharp
// CORRECT: Fresh instances per test
public class OrderServiceTests
{
    private readonly List<Order> _orders;  // Instance field
    private readonly Mock<IRepository> _mockRepo;

    public OrderServiceTests()
    {
        _orders = new List<Order>();  // Fresh for each test
        _mockRepo = new Mock<IRepository>();  // Fresh for each test
    }

    [Fact]
    public void Test1()
    {
        _orders.Add(new Order());
    }

    [Fact]
    public void Test2()
    {
        Assert.Empty(_orders);  // Always passes - fresh list
    }
}
```

---

## Testing Implementation Details

**Don't**: Test private methods or internal implementation details.

```csharp
// BAD: Testing private method via reflection
[Fact]
public void PrivateCalculateHash_ShouldReturnValidHash()
{
    var method = typeof(UserService)
        .GetMethod("CalculateHash", BindingFlags.NonPublic | BindingFlags.Instance);
    var result = method.Invoke(_sut, new object[] { "input" });
    // ...
}

// BAD: Testing internal state
[Fact]
public void ProcessOrder_ShouldSetInternalFlag()
{
    _sut.ProcessOrder(order);

    var field = typeof(OrderService)
        .GetField("_processingComplete", BindingFlags.NonPublic | BindingFlags.Instance);
    var value = (bool)field.GetValue(_sut);
    Assert.True(value);
}
```

**Why it's wrong**: Tests become coupled to implementation, break on refactoring, and don't test actual behavior.

**Instead**: Test through public interfaces. If you need to test a private method, it might belong in its own class.

```csharp
// CORRECT: Test through public interface
[Fact]
public async Task ProcessOrder_WithValidOrder_ReturnsSuccessResult()
{
    var result = await _sut.ProcessOrderAsync(order);

    Assert.True(result.IsSuccess);
    Assert.Equal(OrderStatus.Processed, result.Order.Status);
}

// If private logic is complex enough to test directly,
// extract it to its own class
public class HashCalculator : IHashCalculator
{
    public string Calculate(string input) { /* ... */ }
}

[Fact]
public void Calculate_WithInput_ReturnsValidHash()
{
    var calculator = new HashCalculator();
    var result = calculator.Calculate("input");
    Assert.NotEmpty(result);
}
```

---

## Vague Assertions

**Don't**: Use vague or missing assertions.

```csharp
// BAD: No meaningful assertion
[Fact]
public async Task ProcessOrder_ShouldWork()
{
    var result = await _sut.ProcessOrderAsync(order);
    Assert.NotNull(result);  // Too vague - what should result contain?
}

// BAD: Testing that no exception was thrown (usually pointless)
[Fact]
public async Task ProcessOrder_ShouldNotThrow()
{
    var exception = await Record.ExceptionAsync(() => _sut.ProcessOrderAsync(order));
    Assert.Null(exception);
}

// BAD: Using Assert.True with no context
[Fact]
public void Validate_ShouldPass()
{
    var result = _sut.Validate(input);
    Assert.True(result);  // If this fails, what went wrong?
}
```

**Why it's wrong**: Tests pass but don't verify meaningful behavior. False confidence in code correctness.

**Instead**: Assert on specific expected values and behaviors.

```csharp
// CORRECT: Specific assertions
[Fact]
public async Task ProcessOrder_WithValidOrder_ReturnsProcessedOrderWithTimestamp()
{
    var result = await _sut.ProcessOrderAsync(order);

    Assert.NotNull(result);
    Assert.Equal(OrderStatus.Processed, result.Status);
    Assert.NotNull(result.ProcessedAt);
    Assert.Equal(order.Id, result.OrderId);
}

// CORRECT: Assert on validation result with context
[Fact]
public void Validate_WithValidInput_ReturnsSuccessWithNoErrors()
{
    var result = _sut.Validate(input);

    Assert.True(result.IsValid, $"Expected valid but got errors: {string.Join(", ", result.Errors)}");
    Assert.Empty(result.Errors);
}

// CORRECT: When testing that exceptions ARE thrown
[Fact]
public async Task ProcessOrder_WithNullOrder_ThrowsArgumentNullException()
{
    var exception = await Assert.ThrowsAsync<ArgumentNullException>(
        () => _sut.ProcessOrderAsync(null!));

    Assert.Equal("order", exception.ParamName);
}
```

---

## Summary Checklist

Before committing tests, verify:

- [ ] No `.Result` or `.Wait()` on async operations
- [ ] No static mutable state shared between tests
- [ ] Not testing private methods via reflection
- [ ] Not verifying every mock interaction (only essential ones)
- [ ] Assertions are specific and meaningful
- [ ] Tests fail before implementation (TDD)
- [ ] Tests don't depend on execution order
- [ ] No `Thread.Sleep` (use async waits instead)
- [ ] Test names describe behavior, not implementation
