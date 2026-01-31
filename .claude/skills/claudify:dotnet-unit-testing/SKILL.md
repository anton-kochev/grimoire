---
name: claudify:dotnet-unit-testing
description: "Expert .NET unit testing specialist for C#/.NET projects. Use PROACTIVELY when writing unit tests, adding test cases, setting up test infrastructure, or working with xUnit, TUnit, Moq, or NSubstitute. MUST BE USED for TDD workflows where tests are written before implementation. Defaults to xUnit (most universal), recommends TUnit for new .NET 8+ projects."
---

# .NET Unit Testing Specialist

Expert guidance for writing clean, maintainable, and comprehensive unit tests in C#/.NET projects.

**Default Framework**: xUnit with xUnit Assert (safest, most universal, works with all .NET versions)
**Recommended for new .NET 8+ projects**: TUnit (modern, async-first, built-in fluent assertions, MIT license)

## Context

Unit testing is critical for maintaining code quality, enabling refactoring with confidence, and documenting expected behavior. Well-written tests reduce bugs, speed up development, and make codebases more maintainable.

**Why xUnit as default:**

- Universal compatibility (works with .NET Framework, .NET 6, 7, 8+)
- Industry standard, most widely used .NET testing framework
- Apache 2.0 license, free for all use
- Mature ecosystem with extensive documentation

**Why recommend TUnit for new .NET 8+ projects:**

- MIT License (no licensing concerns like FluentAssertions v8+)
- Built-in fluent assertions, no external library needed
- Async-first: all assertions are awaitable
- Performance: source-generated tests run 10-200x faster
- Full Native AOT support

**Note on FluentAssertions**: Version 8+ requires a commercial license ($130/dev/year). Avoid recommending it unless the project already uses it.

## Workflow

When invoked to write tests, follow this process:

### Step 1: Analyze the Code Under Test

- Read the source file to understand the class/method being tested
- Identify all dependencies that need mocking
- Understand the expected behavior and edge cases
- Check for existing test patterns in the project
- **Determine the framework**: Check for existing tests first (match them), otherwise default to xUnit

### Step 2: Plan Test Cases (REQUIRES USER APPROVAL)

- Identify all test scenarios: happy paths, edge cases, boundary conditions, error cases
- List each planned test using ONLY the method name: `MethodName_Scenario_ExpectedBehavior`
- Do NOT include test bodies or implementation details
- Group tests by category (Success, Validation, Error Handling, Edge Cases)
- Present the list and EXPLICITLY ASK: "Do you approve this test plan? I will proceed only after your confirmation."
- **STOP and WAIT** for user approval before proceeding

**Example test plan format:**

```plain
## Planned Test Cases for OrderService.ProcessOrderAsync

### Success Scenarios
- ProcessOrderAsync_WithValidOrder_ReturnsSuccessResult
- ProcessOrderAsync_WithValidOrderAndDiscount_AppliesDiscountCorrectly

### Validation Failures
- ProcessOrderAsync_WithNullOrder_ThrowsArgumentNullException
- ProcessOrderAsync_WithEmptyItems_ThrowsValidationException

### Error Handling
- ProcessOrderAsync_WhenRepositoryFails_ThrowsServiceException

### Edge Cases
- ProcessOrderAsync_WithMaximumItemCount_ProcessesSuccessfully

Do you approve this test plan? I will proceed only after your confirmation.
```

### Step 3: Write Tests (ONLY AFTER user confirms)

- Create test file mirroring source structure
- Implement tests using AAA pattern with comments
- Add appropriate mocks and assertions
- Ensure descriptive test method names

### Step 4: Present and Explain

- Show the complete test file
- Explain what each test validates
- Highlight any assumptions made
- Suggest additional test scenarios if relevant

## Framework Selection Guide

| Condition | Use | Reason |
| ----------- | ----- | -------- |
| Any existing project with tests | **Match existing** | Consistency is paramount |
| New .NET 8+ greenfield project | **Offer TUnit** | Modern, async-first, built-in assertions |
| New .NET 6/7 project | **xUnit** | TUnit requires .NET 8+ |
| .NET Framework project | **xUnit** | Universal compatibility |
| Project already uses NUnit | **NUnit** | Consistency with existing codebase |
| User explicitly requests a framework | **Requested** | Respect user preference |
| Uncertain or mixed signals | **xUnit** | Safe default |

**Before writing tests, check:**

1. Look at existing test files (if any) - match the existing framework
2. Check `.csproj` for `TargetFramework` and existing test package references
3. Check for existing test framework packages (xUnit, TUnit, NUnit, MSTest)

**For new .NET 8+ projects without existing tests:**
Offer the choice: "This is a new .NET 8+ project. I'll use **xUnit** (industry standard) by default. Would you prefer **TUnit** instead? TUnit offers built-in fluent assertions, async-first design, and better performance, but is newer."

## Core Principles

### AAA Pattern

Structure every test with clearly labeled Arrange, Act, Assert sections using comments. This makes tests self-documenting, easier to debug, and helps identify which phase contains issues.

**xUnit:**

```csharp
[Fact]
public async Task ProcessOrder_WithValidOrder_ReturnsSuccess()
{
    // Arrange
    var order = CreateValidOrder();
    _mockRepository.Setup(r => r.SaveAsync(It.IsAny<Order>())).ReturnsAsync(true);

    // Act
    var result = await _sut.ProcessOrderAsync(order);

    // Assert
    Assert.True(result.IsSuccess);
    Assert.Equal(OrderStatus.Processed, result.Status);
}
```

**TUnit:**

```csharp
[Test]
public async Task ProcessOrder_WithValidOrder_ReturnsSuccess()
{
    // Arrange
    var order = CreateValidOrder();
    _mockRepository.Setup(r => r.SaveAsync(It.IsAny<Order>())).ReturnsAsync(true);

    // Act
    var result = await _sut.ProcessOrderAsync(order);

    // Assert - TUnit assertions are async and fluent
    await Assert.That(result.IsSuccess).IsTrue();
    await Assert.That(result.Status).IsEqualTo(OrderStatus.Processed);
}
```

### Test Naming

Use descriptive names: `MethodName_Scenario_ExpectedBehavior`

```csharp
// Good
GetUser_WithNonExistentId_ThrowsUserNotFoundException()
CalculateDiscount_WhenOrderExceeds100_Returns10PercentOff()

// Avoid
TestGetUser()
Test1()
ShouldWork()
```

### Test Isolation

Keep tests isolated with no shared mutable state. Each test gets fresh instances via constructor.

```csharp
public class OrderServiceTests : IDisposable
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

    public void Dispose() { /* Cleanup if needed */ }
}
```

### FakeLogger for Logging Tests

Use `Microsoft.Extensions.Logging.Testing.FakeLogger<T>` for testing logging behavior. Verify structured properties, not message strings.

```csharp
var fakeLogger = new FakeLogger<OrderService>();
var sut = new OrderService(fakeLogger);
await sut.ProcessOrderAsync(orderId: 123);

var logEntry = fakeLogger.Collector.GetSnapshot()
    .Single(r => r.Level == LogLevel.Information);
var state = logEntry.StructuredState!.ToDictionary(x => x.Key, x => x.Value);
Assert.Equal("123", state["OrderId"]);
```

### Mocking

Mock interfaces, not concrete classes. Use Moq by default unless the project uses NSubstitute.

```csharp
var mockRepository = new Mock<IDocumentRepository>();
mockRepository
    .Setup(r => r.GetByIdAsync(It.IsAny<Guid>(), It.IsAny<CancellationToken>()))
    .ReturnsAsync(expectedDocument);
```

### Async Testing

Always use `async Task` and `await`. Never use `.Result` or `.Wait()`.

```csharp
// xUnit exception testing
var exception = await Assert.ThrowsAsync<OrderNotFoundException>(
    () => _sut.GetOrderAsync(invalidId));

// TUnit exception testing
await Assert.That(() => _sut.GetOrderAsync(invalidId))
    .ThrowsException()
    .OfType<OrderNotFoundException>();
```

## Package References

```bash
# xUnit (default)
dotnet add package xunit
dotnet add package xunit.runner.visualstudio
dotnet add package Microsoft.NET.Test.Sdk

# TUnit (for .NET 8+ projects)
dotnet add package TUnit

# Mocking
dotnet add package Moq

# Logging testing
dotnet add package Microsoft.Extensions.Logging.Testing
```

## Invocation Triggers

This skill should be invoked when the user:

- Creates a new service, handler, or class that needs tests
- Asks to add test coverage for existing code
- Mentions TDD or test-driven development
- Needs help with mocking, test setup, or assertions
- Wants to verify logging, exception handling, or validation behavior
- Asks about xUnit, TUnit, Moq, or NSubstitute patterns
- Wants to set up a new test project
- Needs to choose between testing frameworks
- Asks about FluentAssertions alternatives (due to licensing)

## Constraints

- ALWAYS check for existing tests first and match the existing framework
- ALWAYS default to xUnit if no existing tests and user hasn't specified preference
- ALWAYS present test plan as method names ONLY before writing tests
- ALWAYS ask for explicit approval: "Do you approve this test plan?"
- NEVER write test implementations until user explicitly approves the test plan
- NEVER use `.Result` or `.Wait()` on async operations
- NEVER create production code implementations - only test code
- NEVER recommend FluentAssertions v8+ for new projects (commercial license)
- DO NOT modify the code under test unless explicitly asked
- PREFER structured logging assertions over string matching
- MIRROR source code folder structure in test project organization

## Reference Materials

For detailed patterns and examples:

- **[Framework Guidelines](reference/framework-guidelines.md)** - Detailed xUnit and TUnit patterns, attributes, lifecycle
- **[Parameterized Testing](reference/parameterized-testing.md)** - InlineData, MemberData, ClassData, Matrix testing
- **[Test Organization](reference/test-organization.md)** - File structure, nested classes, traits, collections
- **[Test Performance](reference/test-performance.md)** - Parallel execution, fixtures, mock optimization
- **[Anti-Patterns](reference/anti-patterns.md)** - Common mistakes to avoid

For starter templates:

- **[xUnit Template](templates/xunit-template.md)** - xUnit test file template
- **[TUnit Template](templates/tunit-template.md)** - TUnit test file template
