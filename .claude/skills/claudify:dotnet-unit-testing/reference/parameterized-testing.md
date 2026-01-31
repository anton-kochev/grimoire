# Parameterized Testing

Comprehensive guide to parameterized testing in xUnit and TUnit.

## Table of Contents

- [When to Use Each Data Source](#when-to-use-each-data-source)
- [xUnit Parameterized Testing](#xunit-parameterized-testing)
  - [InlineData](#xunit-inlinedata)
  - [MemberData](#xunit-memberdata)
  - [ClassData](#xunit-classdata)
- [TUnit Parameterized Testing](#tunit-parameterized-testing)
  - [Arguments](#tunit-arguments)
  - [MethodDataSource](#tunit-methoddatasource)
  - [ClassDataSource](#tunit-classdatasource)
  - [Matrix Testing](#tunit-matrix-testing)
- [Best Practices](#best-practices)

---

## When to Use Each Data Source

| Data Source | Use When | xUnit | TUnit |
| ------------- | ---------- | ------- | ------- |
| **Inline** | Few simple values (primitives, strings) | `[InlineData]` | `[Arguments]` |
| **Method** | Computed data, shared within same class | `[MemberData]` | `[MethodDataSource]` |
| **Class** | Reusable data across multiple test classes | `[ClassData]` | `[ClassDataSource]` |
| **Matrix** | Test all combinations of inputs | Manual | `[Matrix]` (built-in) |

---

## xUnit Parameterized Testing

### xUnit InlineData

For simple primitive values:

```csharp
[Theory]
[InlineData("", false)]
[InlineData("test@example.com", true)]
[InlineData("invalid", false)]
[InlineData("user@domain.co.uk", true)]
public void IsValidEmail_WithVariousInputs_ReturnsExpected(string email, bool expected)
{
    var result = _sut.IsValidEmail(email);
    Assert.Equal(expected, result);
}
```

### xUnit MemberData

For computed or complex data from methods in the same class:

```csharp
[Theory]
[MemberData(nameof(GetDiscountTestCases))]
public void CalculateDiscount_WithVariousOrders_ReturnsExpectedDiscount(
    Order order, decimal expectedDiscount, string scenario)
{
    // Arrange & Act
    var result = _sut.CalculateDiscount(order);

    // Assert
    Assert.Equal(expectedDiscount, result);
}

public static IEnumerable<object[]> GetDiscountTestCases()
{
    yield return new object[]
    {
        new Order { Total = 50m },
        0m,
        "No discount under $100"
    };
    yield return new object[]
    {
        new Order { Total = 100m },
        10m,
        "10% discount at $100"
    };
    yield return new object[]
    {
        new Order { Total = 500m, IsPremiumCustomer = true },
        100m,
        "20% discount for premium over $500"
    };
}
```

**Referencing data from another class:**

```csharp
[Theory]
[MemberData(nameof(OrderTestData.ValidOrders), MemberType = typeof(OrderTestData))]
public async Task ProcessOrder_WithValidOrder_Succeeds(Order order) { }

public static class OrderTestData
{
    public static IEnumerable<object[]> ValidOrders => new[]
    {
        new object[] { CreateStandardOrder() },
        new object[] { CreatePremiumOrder() },
        new object[] { CreateBulkOrder() }
    };
}
```

### xUnit ClassData

For reusable test data across multiple test classes:

```csharp
// Define reusable test data class
public class ValidEmailTestData : IEnumerable<object[]>
{
    public IEnumerator<object[]> GetEnumerator()
    {
        yield return new object[] { "test@example.com" };
        yield return new object[] { "user.name@domain.co.uk" };
        yield return new object[] { "user+tag@example.org" };
    }

    IEnumerator IEnumerable.GetEnumerator() => GetEnumerator();
}

public class InvalidEmailTestData : IEnumerable<object[]>
{
    public IEnumerator<object[]> GetEnumerator()
    {
        yield return new object[] { "" };
        yield return new object[] { "notanemail" };
        yield return new object[] { "@nodomain.com" };
        yield return new object[] { "spaces in@email.com" };
    }

    IEnumerator IEnumerable.GetEnumerator() => GetEnumerator();
}

// Use in multiple test classes
public class EmailValidatorTests
{
    [Theory]
    [ClassData(typeof(ValidEmailTestData))]
    public void IsValid_WithValidEmail_ReturnsTrue(string email)
    {
        Assert.True(_sut.IsValid(email));
    }

    [Theory]
    [ClassData(typeof(InvalidEmailTestData))]
    public void IsValid_WithInvalidEmail_ReturnsFalse(string email)
    {
        Assert.False(_sut.IsValid(email));
    }
}

public class EmailServiceTests
{
    [Theory]
    [ClassData(typeof(ValidEmailTestData))]
    public async Task SendEmail_WithValidAddress_Succeeds(string email)
    {
        // Reusing same test data in different test class
        var result = await _sut.SendAsync(email, "Subject", "Body");
        Assert.True(result.Success);
    }
}
```

---

## TUnit Parameterized Testing

### TUnit Arguments

For simple values (equivalent to xUnit's InlineData):

```csharp
[Test]
[Arguments("", false)]
[Arguments("test@example.com", true)]
[Arguments("invalid", false)]
[Arguments("user@domain.co.uk", true)]
public async Task IsValidEmail_WithVariousInputs_ReturnsExpected(string email, bool expected)
{
    var result = _sut.IsValidEmail(email);
    await Assert.That(result).IsEqualTo(expected);
}
```

### TUnit MethodDataSource

For computed data (equivalent to xUnit's MemberData):

```csharp
[Test]
[MethodDataSource(nameof(GetDiscountTestCases))]
public async Task CalculateDiscount_WithVariousOrders_ReturnsExpectedDiscount(
    Order order, decimal expectedDiscount, string scenario)
{
    var result = _sut.CalculateDiscount(order);
    await Assert.That(result).IsEqualTo(expectedDiscount);
}

// TUnit supports tuples for cleaner syntax
public static IEnumerable<(Order Order, decimal ExpectedDiscount, string Scenario)> GetDiscountTestCases()
{
    yield return (
        new Order { Total = 50m },
        0m,
        "No discount under $100"
    );
    yield return (
        new Order { Total = 100m },
        10m,
        "10% discount at $100"
    );
    yield return (
        new Order { Total = 500m, IsPremiumCustomer = true },
        100m,
        "20% discount for premium over $500"
    );
}
```

### TUnit ClassDataSource

For reusable data across test classes:

```csharp
// Define reusable test data source
public class ValidEmailDataSource : DataSourceGeneratorAttribute<string>
{
    public override IEnumerable<string> GenerateDataSources(DataGeneratorMetadata metadata)
    {
        yield return "test@example.com";
        yield return "user.name@domain.co.uk";
        yield return "user+tag@example.org";
    }
}

public class InvalidEmailDataSource : DataSourceGeneratorAttribute<string>
{
    public override IEnumerable<string> GenerateDataSources(DataGeneratorMetadata metadata)
    {
        yield return "";
        yield return "notanemail";
        yield return "@nodomain.com";
        yield return "spaces in@email.com";
    }
}

// Use in tests
public class EmailValidatorTests
{
    [Test]
    [ValidEmailDataSource]
    public async Task IsValid_WithValidEmail_ReturnsTrue(string email)
    {
        await Assert.That(_sut.IsValid(email)).IsTrue();
    }

    [Test]
    [InvalidEmailDataSource]
    public async Task IsValid_WithInvalidEmail_ReturnsFalse(string email)
    {
        await Assert.That(_sut.IsValid(email)).IsFalse();
    }
}
```

### TUnit Matrix Testing

TUnit's unique feature for combinatorial testing:

```csharp
// Test all combinations automatically
// This generates 3 × 2 × 2 = 12 test cases
[Test]
[Matrix("Small", "Medium", "Large")]
[Matrix("Standard", "Express")]
[Matrix(true, false)]
public async Task CalculateShipping_MatrixTest_ReturnsValidPrice(
    string size, string shippingMethod, bool isInternational)
{
    var result = await _sut.CalculateShippingAsync(size, shippingMethod, isInternational);

    await Assert.That(result).IsGreaterThan(0);
}
```

---

## Best Practices

### 1. Include Scenario Descriptions

```csharp
// xUnit - Add description as last parameter
[Theory]
[InlineData(100, 10, "Standard 10% discount")]
[InlineData(500, 75, "Premium 15% discount")]
[InlineData(50, 0, "No discount under threshold")]
public void CalculateDiscount_Scenarios(decimal total, decimal expected, string scenario)
{
    // scenario parameter helps identify which case failed
}

// TUnit - Use DisplayName
[Test]
[Arguments("", false, DisplayName = "Empty string should be invalid")]
[Arguments("test@example.com", true, DisplayName = "Standard email should be valid")]
public async Task IsValidEmail_WithDisplayNames(string email, bool expected)
{
    await Assert.That(_sut.IsValid(email)).IsEqualTo(expected);
}
```

### 2. Group Related Test Data

```csharp
public static class OrderTestData
{
    public static IEnumerable<object[]> ValidOrders => new[]
    {
        new object[] { CreateStandardOrder() },
        new object[] { CreatePremiumOrder() },
        new object[] { CreateBulkOrder() }
    };

    public static IEnumerable<object[]> InvalidOrders => new[]
    {
        new object[] { CreateEmptyOrder() },
        new object[] { CreateNegativeQuantityOrder() },
        new object[] { CreateExpiredOrder() }
    };
}
```

### 3. Test Boundary Conditions

```csharp
[Theory]
[InlineData(int.MinValue)]    // Minimum boundary
[InlineData(-1)]              // Just below zero
[InlineData(0)]               // Zero boundary
[InlineData(1)]               // Just above zero
[InlineData(int.MaxValue)]    // Maximum boundary
public void ProcessValue_WithBoundaryValues_HandlesCorrectly(int value)
{
    // Test behavior at boundaries
}
```

### 4. Avoid Too Many Parameters

```csharp
// BAD: Too many parameters, hard to read
[Theory]
[InlineData("John", "Doe", 25, "john@test.com", "123 Main St", "NYC", "NY", "10001", true)]
public void CreateUser_TooManyParams(string first, string last, int age, ...) { }

// GOOD: Use a test data object
[Theory]
[MemberData(nameof(GetUserTestCases))]
public void CreateUser_WithTestObject(UserTestCase testCase)
{
    var result = _sut.CreateUser(testCase.Input);
    Assert.Equal(testCase.ExpectedResult, result.Success);
}

public record UserTestCase(UserInput Input, bool ExpectedResult, string Scenario);
```

### 5. Keep Test Data Close to Tests

For data used by only one test class, keep it in the same file. Only extract to separate classes when shared across multiple test files.
