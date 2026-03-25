---
name: grimoire.unit-testing-go
description: "Go unit testing specialist. Patterns and best practices for the testing stdlib, testify, and gomock. Use when writing tests for .go files, table-driven tests, or asking about Go testing patterns, test helpers, mocking interfaces, benchmarks."
---

# Go Unit Testing

Focused guidance for writing clean, idiomatic unit tests in Go projects.

## Framework Selection

### Detection

1. Check existing test files first — always match what the project uses
2. Check `go.mod` for `testify`, `gomock`, `mockery` dependencies
3. Check existing `*_test.go` files for assertion style

### Decision Table

| Condition | Use | Reason |
|-----------|-----|--------|
| Project has existing tests | **Match existing** | Consistency is paramount |
| New project, standard needs | **testing** (stdlib) | Built-in, zero dependencies |
| Need rich assertions + mocking | **testify** | `assert`, `require`, `mock` packages |
| Strict interface mocking | **gomock** | Code generation, strict expectations |
| User explicitly requests | **Requested** | Respect user preference |

## Naming Conventions

Use `TestMethod_Scenario_Expected` with PascalCase/underscores:

```go
// Pattern: TestMethod_Scenario_Expected
func TestGetUser_WithInvalidID_ReturnsNotFound(t *testing.T) { ... }
func TestCalculateTotal_WithDiscount_AppliesPercentage(t *testing.T) { ... }
func TestParseConfig_WithMissingFields_ReturnsError(t *testing.T) { ... }
```

## Patterns

### AAA with testify

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
```

### Table-Driven Tests (Go idiom)

```go
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

### Table-Driven with Error Cases

```go
func TestValidateOrder(t *testing.T) {
    tests := []struct {
        name    string
        order   Order
        wantErr error
    }{
        {"valid order", validOrder(), nil},
        {"empty items", Order{Items: nil}, ErrEmptyItems},
        {"negative total", Order{Total: -1}, ErrNegativeTotal},
    }
    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            err := ValidateOrder(tt.order)
            if tt.wantErr != nil {
                assert.ErrorIs(t, err, tt.wantErr)
            } else {
                assert.NoError(t, err)
            }
        })
    }
}
```

### Test Helpers

```go
// t.Helper() marks function as a test helper — errors report caller's line
func newTestService(t *testing.T, opts ...func(*ServiceConfig)) *OrderService {
    t.Helper()
    cfg := defaultTestConfig()
    for _, opt := range opts {
        opt(cfg)
    }
    return NewOrderService(cfg)
}

// t.Cleanup() for automatic teardown
func setupTestDB(t *testing.T) *sql.DB {
    t.Helper()
    db, err := sql.Open("sqlite3", ":memory:")
    require.NoError(t, err)
    t.Cleanup(func() { db.Close() })
    return db
}
```

### Subtests for Parallel Execution

```go
func TestOrderService(t *testing.T) {
    t.Run("ProcessOrder", func(t *testing.T) {
        t.Run("with valid order", func(t *testing.T) {
            t.Parallel()
            // ... test body
        })
        t.Run("with invalid order", func(t *testing.T) {
            t.Parallel()
            // ... test body
        })
    })
}
```

### Error Testing

```go
// Check specific error
func TestDivide_ByZero_ReturnsError(t *testing.T) {
    _, err := Divide(1, 0)
    assert.ErrorIs(t, err, ErrDivideByZero)
}

// Check error type
func TestParse_InvalidInput_ReturnsParseError(t *testing.T) {
    _, err := Parse("bad input")
    var parseErr *ParseError
    assert.ErrorAs(t, err, &parseErr)
    assert.Equal(t, "bad input", parseErr.Input)
}

// Check error message
func TestValidate_EmptyName_ReturnsErrorMessage(t *testing.T) {
    err := Validate(User{Name: ""})
    assert.EqualError(t, err, "name cannot be empty")
}
```

## Mocking

### testify/mock

```go
type MockOrderRepository struct {
    mock.Mock
}

func (m *MockOrderRepository) Save(ctx context.Context, order *Order) (*Order, error) {
    args := m.Called(ctx, order)
    return args.Get(0).(*Order), args.Error(1)
}

// Usage
repo := new(MockOrderRepository)
repo.On("Save", mock.Anything, mock.Anything).Return(&Order{ID: "123"}, nil)
// ... use repo ...
repo.AssertExpectations(t)
```

### Interface-based fakes (preferred for simple cases)

```go
// Define a minimal interface where you use it
type orderSaver interface {
    Save(ctx context.Context, order *Order) (*Order, error)
}

// Fake implementation in test file
type fakeOrderSaver struct {
    saved []*Order
    err   error
}

func (f *fakeOrderSaver) Save(_ context.Context, order *Order) (*Order, error) {
    if f.err != nil {
        return nil, f.err
    }
    f.saved = append(f.saved, order)
    return &Order{ID: "123"}, nil
}
```

### What NOT to mock

- Value types, structs used as data containers
- Pure functions with no side effects
- The package under test itself
- Standard library types (use real `bytes.Buffer`, etc.)

Mock only at system boundaries: external APIs, databases, file system, time.

## File Conventions

- `*_test.go` in the same package (white-box) or `_test` package (black-box)
- `go test ./...` to run all tests
- `testdata/` for test fixtures (ignored by Go tooling)
- `go test -race ./...` to detect race conditions
- `go test -cover ./...` for coverage

## Authoritative Sources

- testing package: https://pkg.go.dev/testing
- testify: https://github.com/stretchr/testify
- gomock: https://github.com/uber-go/mock
- Kent Beck — Canon TDD: https://tidyfirst.substack.com/p/canon-tdd
- Martin Fowler — Mocks Aren't Stubs: https://martinfowler.com/articles/mocksArentStubs.html

## Reference Materials

- **[Anti-Patterns](reference/anti-patterns.md)** — Common testing mistakes and how to fix them
- **[TDD Workflow Patterns](reference/tdd-workflow-patterns.md)** — Red-Green-Refactor, Transformation Priority Premise, when to use TDD
