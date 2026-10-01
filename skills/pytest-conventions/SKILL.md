---
name: pytest-conventions
description: Use when writing, maintaining, reviewing, or debugging Python tests with pytest. Enforces AAA structure, fixture patterns, parametrization, DAMP test naming, 100% coverage, and strict isolation.
---

# Pytest Testing Conventions

Opinionated, comprehensive testing patterns for Python and pytest. Incorporates proven patterns from `pytest-patterns`, `pytest-best-practices`, and `python-testing-patterns`. Follow these instructions whenever writing, refactoring, or reviewing Python tests.

---

## 1. Core Principles

1. **Test behavior, not implementation**: Focus on what the code does and its observable contract, not internal private implementation details.
2. **Arrange-Act-Assert (AAA), Visibly**: Visibly separate every test function into three distinct blocks using single blank lines: setup (Arrange), the single action under test (Act), and verification (Assert).
3. **One assertion concept per test**: A test verifies a single outcome or behavior. Multiple `assert` statements are permitted only when validating properties of the same single result.
4. **DAMP over DRY in tests**: Descriptive And Meaningful Phrases over rigid Don't Repeat Yourself. Tests should be readable from top to bottom without jumping through complex helper abstractions.
5. **Fixtures over setup methods**: Never use `unittest`-style `setUp`/`tearDown` or classes. Use pytest fixtures in `conftest.py` or module files.
6. **Narrow fixture scopes**: Default to `function` scope. Widen to `module` or `session` only for expensive, read-only setup (e.g. database engines, mock servers).
7. **Parametrize instead of looping**: Never write a `for` loop inside a test function. Loops hide which iteration failed; `@pytest.mark.parametrize` yields isolated, uniquely identified test cases.
8. **Isolation and order-independence**: Zero shared mutable state across tests. Tests must pass regardless of execution order and run cleanly in parallel (e.g. with `pytest-xdist`).
9. **Mock at the boundary you own**: Patch where the object is *imported and looked up*, not where it is defined. Mock external network, filesystem, and clocks; never mock the unit under test.
10. **100% test coverage**: All new business logic, models, services, and endpoints require 100% test coverage.
    - *Exception*: Pure reverse proxy redirect endpoints without business logic do not require test suites.

---

## 2. Test File & Directory Organization

### Directory Structure & Layout

Mirror the source tree layout inside the `tests/` directory:

We have `tests/`, and then directories for each module (e.g. `entities`, `entity_types`, etc.).
Inside each module directory, we have the module's `conftest.py` and `utils` files:

```
tests/
  conftest.py                   # Root/global session fixtures
  <module_name>/                # Directory for each module (e.g., entities, entity_types)
    conftest.py                 # Module-specific fixtures
    utils.py                    # Module test helpers and mock utilities (or utils/ directory)
    test_<what_we_test>.py      # Test files for this module
```

- **Module Utils**: Use the `utils` files located inside each module directory for module-specific test helpers, factories, and mocks.
- **Path format**: `tests/<module_name>/test_<what_we_test>.py`.
- **Test function naming**: `test_<unit>_<condition>_<expected>`:
  - `test_create_user_duplicate_email_raises_duplicate_user_error`
  - `test_calculate_discount_zero_percent_returns_original_price`
  - `test_verify_token_expired_signature_returns_false`

### Internal Test File Structure

Every test file must follow this strict sequence:
1. **Imports straight away**: Standard library, third-party, application code under test.
2. **Local Fixtures**: Module-specific fixtures immediately following imports.
3. **Test Functions**: Standalone functions (`def test_*`).
   - **No classes in test files** unless strictly necessary.
   - **No code comments in test files** unless strictly necessary to document a non-obvious upstream workaround. Tests must be self-explanatory.

---

## 3. The AAA Structure in Action

Every test body must visually separate Arrange, Act, and Assert:

```python
def test_calculate_discount_valid_percentage_reduces_total():
    # Arrange
    base_price: float = 100.0
    discount_percentage: float = 20.0

    # Act
    discounted_price: float = calculate_discount(base_price, discount_percentage)

    # Assert
    assert discounted_price == 80.0
```
*(Omit the `# Arrange`, `# Act`, `# Assert` comment labels in production test files; preserve the blank line separation).*

---

## 4. Fixture Patterns & Scoping

### Conftest Hierarchy

Fixtures cascade downwards from root `tests/conftest.py` into module-level `conftest.py` files. Keep shared database connections and global clients in root `conftest.py`:

```python
# tests/conftest.py
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

@pytest.fixture(scope="session")
def db_engine():
    """
    Created once for the entire test session.
    """
    engine = create_engine("sqlite:///:memory:", future=True)
    create_schema(engine)
    yield engine
    engine.dispose()

@pytest.fixture(scope="function")
def db_session(db_engine):
    """
    Isolated per test: rolls back all writes upon teardown.
    """
    connection = db_engine.connect()
    transaction = connection.begin()
    session = Session(bind=connection)
    try:
        yield session
    finally:
        session.close()
        transaction.rollback()
        connection.close()
```

### Yield Fixtures (Automatic Cleanup)

Always use `yield` fixtures when setup requires cleanup or teardown:

```python
@pytest.fixture
def temp_cache_dir(tmp_path):
    cache_dir = tmp_path / "cache"
    cache_dir.mkdir()
    yield cache_dir
    # Cleanup occurs automatically via tmp_path
```

### Fixture Factories

When tests need multiple variants of an entity or customized objects, yield a factory function rather than hardcoding static fixtures:

```python
@pytest.fixture
def make_user():
    created_users: list[User] = []

    def _make(email: str = None, role: str = "member") -> User:
        user_id = str(uuid4())
        user = User(id=user_id, email=email or f"test-{user_id}@example.com", role=role)
        created_users.append(user)
        return user

    yield _make

    for user in created_users:
        delete_user(user.id)

def test_admin_access_allowed(make_user):
    admin = make_user(role="admin")
    member = make_user(role="member")

    assert has_admin_access(admin) is True
    assert has_admin_access(member) is False
```

---

## 5. Parametrization & Data-Driven Tests

Never use loops inside test methods. Use `@pytest.mark.parametrize`:

```python
@pytest.mark.parametrize("input_email,is_valid", [
    ("user@domain.com", True),
    ("first.last@company.org", True),
    ("missing-at.com", False),
    ("@no-username.org", False),
    ("", False),
])
def test_email_validator_various_inputs(input_email: str, is_valid: bool):
    validation_result: bool = validate_email_address(input_email)

    assert validation_result is is_valid
```

---

## 6. Testing Exceptions & Error Paths

Always test error branches and custom exception handling. Use `pytest.raises` with exact exception types and message matching:

```python
def test_withdraw_insufficient_funds_raises_overdraft_error():
    account: BankAccount = BankAccount(balance=50.0)

    with pytest.raises(InsufficientFundsError, match="Requested 100.0 but balance is 50.0"):
        account.withdraw(100.0)
```

Never assert generic `Exception` or `ValueError` when domain exceptions are defined.

---

## 7. Mocking Best Practices

- **Patch where the name is used/imported**:
  If `services/user.py` imports `send_email` from `utils/email.py`, patch `services.user.send_email`, NOT `utils.email.send_email`.
- **Deterministic Time**: Use `monkeypatch` or `freezegun` to freeze clock values in time-dependent tests.
- **Never mock the subject under test**: Only mock external network calls, system timers, and third-party APIs.

---

## 8. Running Tests

Always execute test commands with `uv`:

```bash
uv run pytest
uv run pytest tests/auth/test_login_flow.py
uv run pytest -k "test_login" -v
uv run pytest -m "not slow"
```
