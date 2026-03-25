---
name: grimoire.unit-testing-python
description: "Python unit testing specialist. Framework selection, patterns, and best practices for pytest, unittest, and hypothesis. Use when writing tests for .py files, configuring pytest, or asking about Python testing patterns, fixtures, parametrize, mocking, async testing."
---

# Python Unit Testing

Focused guidance for writing clean, idiomatic unit tests in Python projects.

## Framework Selection

### Detection

1. Check existing test files first — always match what the project uses
2. Check for `pytest` in `pyproject.toml` dependencies or `[tool.pytest]` section
3. Check for `setup.cfg` or `pytest.ini` configuration
4. Check imports in existing tests (`import pytest` vs `import unittest`)

### Decision Table

| Condition | Use | Reason |
|-----------|-----|--------|
| Project has existing tests | **Match existing** | Consistency is paramount |
| New project, any size | **pytest** | Industry standard, superior ergonomics |
| stdlib only requirement | **unittest** | Built-in, no dependencies |
| User explicitly requests | **Requested** | Respect user preference |

## Naming Conventions

Use `test_method_scenario_expected` with snake_case:

```python
# Pattern: test_method_scenario_expected
def test_get_user_with_invalid_id_raises_not_found(): ...
def test_calculate_total_with_discount_applies_percentage(): ...
def test_parse_config_with_missing_fields_raises_validation_error(): ...

# Class grouping (optional)
class TestOrderService:
    def test_process_order_with_valid_input_returns_success(self): ...
    def test_process_order_with_empty_items_raises_validation_error(self): ...
```

## Patterns

### AAA with pytest

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
```

### Parametrize

```python
@pytest.mark.parametrize("discount,expected", [
    (0, 100.0),
    (10, 90.0),
    (50, 50.0),
])
def test_apply_discount_calculates_correctly(discount, expected):
    assert apply_discount(100.0, discount) == expected

# With IDs for readable test names
@pytest.mark.parametrize("input_val,expected", [
    pytest.param("", False, id="empty-string"),
    pytest.param("abc", True, id="non-empty-string"),
    pytest.param(" ", True, id="whitespace-only"),
])
def test_is_non_empty(input_val, expected):
    assert is_non_empty(input_val) == expected
```

### Fixtures

```python
# conftest.py — shared across test files
@pytest.fixture
def db_session():
    session = create_test_session()
    yield session
    session.rollback()

# Fixture composition
@pytest.fixture
def order_service(mock_repo, mock_notifier):
    return OrderService(repo=mock_repo, notifier=mock_notifier)

# Factory fixture for multiple instances
@pytest.fixture
def make_order():
    def _make(status="pending", **kwargs):
        return Order(status=status, **kwargs)
    return _make

def test_cancel_pending_order_succeeds(order_service, make_order):
    order = make_order(status="pending")
    result = order_service.cancel(order)
    assert result.status == "cancelled"
```

### Async Testing

```python
import pytest

# pytest-asyncio auto mode (recommended)
# pyproject.toml: [tool.pytest.ini_options] asyncio_mode = "auto"

async def test_fetch_user_returns_data(mock_api):
    user = await fetch_user("123")
    assert user.name == "Alice"

async def test_fetch_user_with_bad_id_raises(mock_api):
    with pytest.raises(NotFoundError):
        await fetch_user("bad-id")
```

### Error Testing

```python
# Basic exception check
def test_divide_by_zero_raises():
    with pytest.raises(ZeroDivisionError):
        divide(1, 0)

# Match exception message
def test_invalid_email_raises_with_message():
    with pytest.raises(ValidationError, match="invalid email format"):
        validate_email("not-an-email")

# Check exception attributes
def test_validation_error_includes_field():
    with pytest.raises(ValidationError) as exc_info:
        validate_order(invalid_order)
    assert exc_info.value.field == "items"
```

## Mocking

### unittest.mock (stdlib)

```python
from unittest.mock import Mock, AsyncMock, patch, MagicMock

# Basic mock
mock_repo = Mock(spec=OrderRepository)
mock_repo.save.return_value = Order(id="123")

# Async mock
mock_repo.save_async = AsyncMock(return_value=Order(id="123"))

# Patch decorator
@patch("myapp.services.email_client")
def test_sends_email(mock_client):
    mock_client.send.return_value = True
    # ...

# Context manager patch
def test_sends_email():
    with patch("myapp.services.email_client") as mock_client:
        mock_client.send.return_value = True
        # ...

# Verify calls
mock_repo.save.assert_called_once_with(order)
mock_repo.save.assert_not_called()
assert mock_repo.save.call_count == 2
```

### What NOT to mock

- Value objects, dataclasses, named tuples
- Pure functions with no side effects
- The class/module under test itself
- Simple utility functions

Mock only at system boundaries: APIs, databases, file system, time, randomness.

## File Conventions

- `test_*.py` or `*_test.py` in `tests/` directory
- `conftest.py` for shared fixtures (per-directory)
- `pytest.ini`, `pyproject.toml [tool.pytest]`, or `setup.cfg [tool:pytest]` for config
- Run: `pytest` or `python -m pytest`

## Package Setup

```bash
# pytest (recommended)
pip install pytest pytest-asyncio pytest-cov

# Add to pyproject.toml
[tool.pytest.ini_options]
asyncio_mode = "auto"
testpaths = ["tests"]
```

## Authoritative Sources

- pytest: https://docs.pytest.org
- unittest: https://docs.python.org/3/library/unittest.html
- Hypothesis (property-based): https://hypothesis.readthedocs.io
- Kent Beck — Canon TDD: https://tidyfirst.substack.com/p/canon-tdd
- Martin Fowler — Mocks Aren't Stubs: https://martinfowler.com/articles/mocksArentStubs.html

## Reference Materials

- **[Anti-Patterns](reference/anti-patterns.md)** — Common testing mistakes and how to fix them
- **[TDD Workflow Patterns](reference/tdd-workflow-patterns.md)** — Red-Green-Refactor, Transformation Priority Premise, when to use TDD
