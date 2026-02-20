# Language & Framework Reference

Quick-reference for each language's test ecosystem. Use this to apply framework-specific patterns after detecting the project's language.

## Table of Contents

- [JavaScript / TypeScript](#javascript--typescript)
- [Python](#python)
- [Go](#go)
- [Rust](#rust)
- [Java / Kotlin](#java--kotlin)
- [C# / .NET](#c--net)
- [Ruby](#ruby)

## JavaScript / TypeScript

### Frameworks

| Framework | When to Use | Key Feature |
|-----------|-------------|-------------|
| **Vitest** | Vite projects, new TS projects | Fast, ESM-native, Jest-compatible API |
| **Jest** | React (CRA), existing Jest projects | Mature ecosystem, wide adoption |
| **Mocha + Chai** | Legacy projects, custom setups | Flexible, pluggable |
| **Node test runner** | Node.js 20+, minimal deps | Built-in, zero dependencies |

### Vitest / Jest Patterns

```typescript
import { describe, test, expect, vi, beforeEach } from 'vitest';

describe('OrderService', () => {
  let mockRepo: MockedObject<OrderRepository>;
  let service: OrderService;

  beforeEach(() => {
    mockRepo = { save: vi.fn(), findById: vi.fn() };
    service = new OrderService(mockRepo);
  });

  test('processOrder with valid order saves and returns id', async () => {
    // Arrange
    const order = createValidOrder();
    mockRepo.save.mockResolvedValue({ id: '123' });

    // Act
    const result = await service.processOrder(order);

    // Assert
    expect(result.id).toBe('123');
    expect(mockRepo.save).toHaveBeenCalledWith(order);
  });

  test('processOrder with invalid order throws ValidationError', async () => {
    // Arrange
    const order = createInvalidOrder();

    // Act & Assert
    await expect(service.processOrder(order)).rejects.toThrow(ValidationError);
  });
});
```

### File Conventions

- `*.test.ts` / `*.spec.ts` (co-located or in `__tests__/`)
- `vitest.config.ts` or `jest.config.ts` for configuration

## Python

### Frameworks

| Framework | When to Use | Key Feature |
|-----------|-------------|-------------|
| **pytest** | Default choice, most projects | Fixtures, parametrize, plugins |
| **unittest** | stdlib only, legacy projects | Built-in, class-based |

### pytest Patterns

```python
import pytest
from unittest.mock import Mock, AsyncMock, patch

@pytest.fixture
def mock_repo():
    repo = Mock(spec=OrderRepository)
    repo.save = AsyncMock(return_value=Order(id="123"))
    return repo

@pytest.fixture
def service(mock_repo):
    return OrderService(repository=mock_repo)

async def test_process_order_with_valid_order_returns_id(service, mock_repo):
    # Arrange
    order = create_valid_order()

    # Act
    result = await service.process_order(order)

    # Assert
    assert result.id == "123"
    mock_repo.save.assert_called_once_with(order)

async def test_process_order_with_invalid_order_raises_validation_error(service):
    # Arrange
    order = create_invalid_order()

    # Act & Assert
    with pytest.raises(ValidationError, match="items cannot be empty"):
        await service.process_order(order)

@pytest.mark.parametrize("discount,expected", [
    (0, 100.0),
    (10, 90.0),
    (50, 50.0),
])
def test_apply_discount_calculates_correctly(discount, expected):
    assert apply_discount(100.0, discount) == expected
```

### File Conventions

- `test_*.py` or `*_test.py` in `tests/` directory
- `conftest.py` for shared fixtures
- `pytest.ini` or `[tool.pytest.ini_options]` in `pyproject.toml`

## Go

### Frameworks

| Framework | When to Use | Key Feature |
|-----------|-------------|-------------|
| **testing** (stdlib) | Always available | Built-in, no dependencies |
| **testify** | Assertions + mocking | `assert`, `require`, `mock` packages |
| **gomock** | Interface mocking | Code generation, strict expectations |

### Go Patterns

```go
func TestProcessOrder_WithValidOrder_ReturnsID(t *testing.T) {
    // Arrange
    repo := new(MockOrderRepository)
    repo.On("Save", mock.Anything).Return(&Order{ID: "123"}, nil)
    service := NewOrderService(repo)

    // Act
    result, err := service.ProcessOrder(context.Background(), validOrder)

    // Assert
    require.NoError(t, err)
    assert.Equal(t, "123", result.ID)
    repo.AssertExpectations(t)
}

func TestProcessOrder_WithInvalidOrder_ReturnsError(t *testing.T) {
    // Arrange
    service := NewOrderService(nil)

    // Act
    _, err := service.ProcessOrder(context.Background(), invalidOrder)

    // Assert
    assert.ErrorIs(t, err, ErrValidation)
}

// Table-driven tests (Go idiom)
func TestApplyDiscount(t *testing.T) {
    tests := []struct {
        name     string
        price    float64
        discount int
        expected float64
    }{
        {"no discount", 100.0, 0, 100.0},
        {"10 percent", 100.0, 10, 90.0},
        {"50 percent", 100.0, 50, 50.0},
    }
    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            result := ApplyDiscount(tt.price, tt.discount)
            assert.Equal(t, tt.expected, result)
        })
    }
}
```

### File Conventions

- `*_test.go` in the same package (or `_test` package for black-box)
- `go test ./...` to run all tests
- `testdata/` for test fixtures

## Rust

### Patterns

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use mockall::predicate::*;

    #[test]
    fn process_order_with_valid_order_returns_id() {
        // Arrange
        let mut mock_repo = MockOrderRepository::new();
        mock_repo.expect_save()
            .returning(|_| Ok(Order { id: "123".into() }));
        let service = OrderService::new(Box::new(mock_repo));

        // Act
        let result = service.process_order(&valid_order());

        // Assert
        assert_eq!(result.unwrap().id, "123");
    }

    #[test]
    fn process_order_with_invalid_order_returns_error() {
        // Arrange
        let service = OrderService::new(Box::new(MockOrderRepository::new()));

        // Act
        let result = service.process_order(&invalid_order());

        // Assert
        assert!(matches!(result, Err(ServiceError::Validation(_))));
    }
}
```

### File Conventions

- Tests in `#[cfg(test)] mod tests` at bottom of source file (unit tests)
- Integration tests in `tests/` directory
- `cargo test` to run all

## Java / Kotlin

### Frameworks

| Framework | When to Use | Key Feature |
|-----------|-------------|-------------|
| **JUnit 5** | Default choice | Modern, extensible, parameterized |
| **Mockito** | Mocking | Intuitive API, wide adoption |
| **AssertJ** | Fluent assertions | Readable, discoverable API |

### JUnit 5 + Mockito Patterns

```java
@ExtendWith(MockitoExtension.class)
class OrderServiceTest {
    @Mock OrderRepository repository;
    @InjectMocks OrderService service;

    @Test
    void processOrder_withValidOrder_returnsId() {
        // Arrange
        var order = createValidOrder();
        when(repository.save(any())).thenReturn(new Order("123"));

        // Act
        var result = service.processOrder(order);

        // Assert
        assertThat(result.getId()).isEqualTo("123");
        verify(repository).save(order);
    }

    @Test
    void processOrder_withInvalidOrder_throwsValidationException() {
        // Arrange
        var order = createInvalidOrder();

        // Act & Assert
        assertThatThrownBy(() -> service.processOrder(order))
            .isInstanceOf(ValidationException.class)
            .hasMessageContaining("items cannot be empty");
    }

    @ParameterizedTest
    @CsvSource({"0, 100.0", "10, 90.0", "50, 50.0"})
    void applyDiscount_calculatesCorrectly(int discount, double expected) {
        assertThat(applyDiscount(100.0, discount)).isEqualTo(expected);
    }
}
```

### File Conventions

- `src/test/java/` mirroring `src/main/java/` structure
- `*Test.java` suffix
- `mvn test` or `gradle test`

## C# / .NET

**If the `grimoire.dotnet-unit-testing` skill is available, defer to it for full C#/.NET guidance.** It provides comprehensive xUnit, TUnit, Moq, and NSubstitute patterns.

### Quick Reference (when dotnet skill is unavailable)

| Framework | When to Use |
|-----------|-------------|
| **xUnit** | Default, most universal |
| **NUnit** | If project already uses it |
| **MSTest** | Microsoft-first shops |

```csharp
public class OrderServiceTests
{
    private readonly Mock<IOrderRepository> _mockRepo;
    private readonly OrderService _sut;

    public OrderServiceTests()
    {
        _mockRepo = new Mock<IOrderRepository>();
        _sut = new OrderService(_mockRepo.Object);
    }

    [Fact]
    public async Task ProcessOrder_WithValidOrder_ReturnsId()
    {
        // Arrange
        var order = CreateValidOrder();
        _mockRepo.Setup(r => r.SaveAsync(It.IsAny<Order>()))
            .ReturnsAsync(new Order { Id = "123" });

        // Act
        var result = await _sut.ProcessOrderAsync(order);

        // Assert
        Assert.Equal("123", result.Id);
    }
}
```

### File Conventions

- `Tests/` or `*.Tests/` project mirroring source structure
- `*Tests.cs` suffix
- `dotnet test` to run

## Ruby

### Frameworks

| Framework | When to Use |
|-----------|-------------|
| **RSpec** | Default, most Ruby projects |
| **Minitest** | stdlib, Rails default |

### RSpec Patterns

```ruby
RSpec.describe OrderService do
  let(:repository) { instance_double(OrderRepository) }
  let(:service) { described_class.new(repository: repository) }

  describe '#process_order' do
    context 'with a valid order' do
      it 'returns the order id' do
        # Arrange
        order = build(:order, :valid)
        allow(repository).to receive(:save).and_return(Order.new(id: '123'))

        # Act
        result = service.process_order(order)

        # Assert
        expect(result.id).to eq('123')
        expect(repository).to have_received(:save).with(order)
      end
    end

    context 'with an invalid order' do
      it 'raises ValidationError' do
        order = build(:order, :invalid)
        expect { service.process_order(order) }.to raise_error(ValidationError)
      end
    end
  end
end
```

### File Conventions

- `spec/` directory mirroring `lib/` or `app/` structure
- `*_spec.rb` suffix
- `bundle exec rspec` to run
