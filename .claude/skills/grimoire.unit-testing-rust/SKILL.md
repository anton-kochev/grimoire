---
name: grimoire.unit-testing-rust
description: "Rust unit testing specialist. Patterns and best practices for the built-in test framework, mockall, and proptest. Use when writing tests for .rs files, or asking about Rust testing patterns, test modules, mocking traits, property-based testing, integration tests."
---

# Rust Unit Testing

Focused guidance for writing clean, idiomatic unit tests in Rust projects.

## Framework Selection

### Detection

1. Check existing test files first — always match what the project uses
2. Check `Cargo.toml` for `mockall`, `proptest`, `rstest` in `[dev-dependencies]`
3. Check existing `#[cfg(test)] mod tests` blocks for assertion style

### Decision Table

| Condition | Use | Reason |
|-----------|-----|--------|
| Project has existing tests | **Match existing** | Consistency is paramount |
| Any Rust project | **Built-in `#[test]`** | Always available, zero deps |
| Need trait mocking | **mockall** | Derive macros for mock generation |
| Need parameterized tests | **rstest** | `#[rstest]` with fixtures and cases |
| Need property-based | **proptest** | QuickCheck-style property testing |
| User explicitly requests | **Requested** | Respect user preference |

## Naming Conventions

Use `test_method_scenario_expected` with snake_case:

```rust
// Pattern: test_method_scenario_expected
fn test_get_user_with_invalid_id_returns_not_found() { ... }
fn test_calculate_total_with_discount_applies_percentage() { ... }
fn test_parse_config_with_missing_fields_returns_error() { ... }
```

## Patterns

### AAA with built-in tests

```rust
#[cfg(test)]
mod tests {
    use super::*;

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

### Parameterized with rstest

```rust
use rstest::rstest;

#[rstest]
#[case(0, 100.0)]
#[case(10, 90.0)]
#[case(50, 50.0)]
fn apply_discount_calculates_correctly(#[case] discount: u32, #[case] expected: f64) {
    assert_eq!(apply_discount(100.0, discount), expected);
}
```

### rstest Fixtures

```rust
use rstest::*;

#[fixture]
fn service() -> OrderService {
    let repo = InMemoryOrderRepository::new();
    OrderService::new(Box::new(repo))
}

#[rstest]
fn process_order_with_valid_order_succeeds(service: OrderService) {
    let result = service.process_order(&valid_order());
    assert!(result.is_ok());
}
```

### Error Testing

```rust
// Check Result is Err
#[test]
fn divide_by_zero_returns_error() {
    let result = divide(1, 0);
    assert!(result.is_err());
}

// Match specific error variant
#[test]
fn parse_invalid_input_returns_parse_error() {
    let result = parse("bad input");
    assert!(matches!(result, Err(ParseError::InvalidFormat(_))));
}

// Check error message
#[test]
fn validate_empty_name_returns_error_message() {
    let err = validate(User { name: "".into() }).unwrap_err();
    assert_eq!(err.to_string(), "name cannot be empty");
}

// Should panic
#[test]
#[should_panic(expected = "index out of bounds")]
fn access_out_of_bounds_panics() {
    let v = vec![1, 2, 3];
    let _ = v[10];
}
```

### Async Testing (tokio)

```rust
#[tokio::test]
async fn fetch_user_returns_data() {
    // Arrange
    let client = MockHttpClient::new();
    client.expect_get().returning(|_| Ok(user_response()));

    // Act
    let user = fetch_user(&client, "123").await.unwrap();

    // Assert
    assert_eq!(user.name, "Alice");
}
```

## Mocking

### mockall

```rust
use mockall::*;
use mockall::predicate::*;

#[automock]
trait OrderRepository {
    fn save(&self, order: &Order) -> Result<Order, RepositoryError>;
    fn find_by_id(&self, id: &str) -> Result<Option<Order>, RepositoryError>;
}

// Usage in tests
let mut mock = MockOrderRepository::new();
mock.expect_save()
    .with(predicate::always())
    .times(1)
    .returning(|order| Ok(Order { id: "123".into(), ..order.clone() }));
mock.expect_find_by_id()
    .with(eq("123"))
    .returning(|_| Ok(Some(Order { id: "123".into(), ..Default::default() })));
```

### Manual fakes (for simple cases)

```rust
// Test-only implementation
struct FakeOrderRepository {
    orders: Vec<Order>,
}

impl OrderRepository for FakeOrderRepository {
    fn save(&self, order: &Order) -> Result<Order, RepositoryError> {
        Ok(Order { id: "fake-id".into(), ..order.clone() })
    }
    fn find_by_id(&self, id: &str) -> Result<Option<Order>, RepositoryError> {
        Ok(self.orders.iter().find(|o| o.id == id).cloned())
    }
}
```

### What NOT to mock

- Structs used as data containers
- Pure functions with no side effects
- The module under test itself
- Standard library types

Mock only at system boundaries: external APIs, databases, file system, time.

## File Conventions

- Unit tests: `#[cfg(test)] mod tests` at bottom of source file
- Integration tests: `tests/` directory (each file is a separate crate)
- Test fixtures: `tests/fixtures/` or inline
- Run: `cargo test` (all), `cargo test -- test_name` (specific)
- Run with output: `cargo test -- --nocapture`

## Package Setup

```toml
# Cargo.toml
[dev-dependencies]
mockall = "0.13"       # trait mocking
rstest = "0.22"        # parameterized tests, fixtures
proptest = "1.5"       # property-based testing
tokio = { version = "1", features = ["test-util", "macros", "rt"] }  # async tests
```

## Authoritative Sources

- The Rust Book — Testing: https://doc.rust-lang.org/book/ch11-00-testing.html
- mockall: https://docs.rs/mockall
- rstest: https://docs.rs/rstest
- proptest: https://proptest-rs.github.io/proptest
- Kent Beck — Canon TDD: https://tidyfirst.substack.com/p/canon-tdd
- Martin Fowler — Mocks Aren't Stubs: https://martinfowler.com/articles/mocksArentStubs.html

## Reference Materials

- **[Anti-Patterns](reference/anti-patterns.md)** — Common testing mistakes and how to fix them
- **[TDD Workflow Patterns](reference/tdd-workflow-patterns.md)** — Red-Green-Refactor, Transformation Priority Premise, when to use TDD
