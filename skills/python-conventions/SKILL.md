---
name: python-conventions
description: Use when creating, modifying, refactoring, or testing Python backend code. Enforces typing standards, exact docstring format, page/section headers, custom exceptions, and references the uv and pytest-conventions skills.
---

# Python Backend Conventions

Strict conventions for Python backend development. Follow these rules whenever reading, writing, refactoring, or testing Python code.

---

## 1. Package Management

For package management and dependency operations, reference and adhere to the **`uv`** skill.

---

## 2. Typing Guidelines

- **Function & Method Signatures**:
  - All function and method parameters **must** have explicit type annotations.
  - Return types **must** be explicitly annotated for all non-None returns (e.g. `-> str`, `-> list[Item]`, `-> tuple[int, bool]`).
- **The `None` Return Rule**:
  - If a function returns nothing or returns None, **do NOT write `-> None`**. Omit the return type annotation completely.
  - **Never write `return None`**. Always write a bare `return`.
- **Local Variable Typing**:
  - Do **NOT** add redundant type annotations on obvious assignments (e.g., `count: int = 0`, `name: str = "alice"`, `is_active: bool = True` is bad and unnecessary).
  - Use type annotations on local variables **only when it is not clear what type the variable is** (e.g., empty collections like `items: list[UserRecord] = []`, complex union returns, or when initializing from untyped external returns).
  - If you are not sure whether the type is clear, **always add the type annotation**.
- **Static Verification**:
  - Run `uv run mypy --strict` (or `mypy --strict`) at the end of each task to verify type correctness across all modified files.

```python
# GOOD:
def save_user_profile(user_id: str, email: str):
    user_record = {"id": user_id, "email": email}  # Obvious dictionary assignment, no redundant type annotation
    active_tokens: list[str] = []  # Empty list where type is not obvious, type annotation required
    db.insert(user_record)
    return

# BAD:
def save_user_profile(user_id, email) -> None:  # Do NOT use -> None and do NOT leave parameters untyped
    count: int = 0  # Redundant typing on obvious literal assignment
    user_record = {"id": user_id, "email": email}
    db.insert(user_record)
    return None  # Do NOT write return None
```

---

## 3. Page Header and Section Structure

Every Python file must follow a consistent top-level layout with page documentation and stylized section dividers.

### Page Documentation Header

```python
"""
EXPLANATION ABOUT PAGE

:author: AUTHOR_NAME
:date: DD/MM/YY
"""
```

### Section Dividers Format

Section lines use the exact format:
```python
# ----- SECTION_NAME ----- #
```
Standard section names: `imports`, `consts`, `classes`, `functions` (and other domain-specific sections as needed, e.g. `routes`).

### Strict Spacing Rules

1. `# ----- Imports ----- #`:
   - Placed **immediately** after the closing `"""` of the page header (no blank lines in between).
   - Exactly **1 blank line** below the section line before imports start.
2. `# ----- consts ----- #`:
   - Exactly **1 blank line** above the section line.
   - Exactly **1 blank line** below the section line.
3. `# ----- classes ----- #` and `# ----- functions ----- #`:
   - Exactly **2 blank lines** above the section line.
   - Exactly **2 blank lines** below the section line.

### Example File Layout

```python
"""
User authentication and session verification service.

:author: backend-team
:date: 01/10/26
"""
# ----- Imports ----- #
import os
from typing import Optional

# ----- consts ----- #
SESSION_TIMEOUT_SECONDS: int = 3600
MAX_LOGIN_ATTEMPTS: int = 5


# ----- classes ----- #
class UserAuthenticationService:
    """
    Handles credential checks and session token issuance.
    """

    def __init__(self, token_provider: TokenProvider):
        self._provider: TokenProvider = token_provider


# ----- functions ----- #
def verify_session_token(token: str) -> bool:
    """
    Check session token validity against active sessions cache.

    :param token: Raw session token string
    :return: True if active and valid, False otherwise
    :raises ExpiredSessionError: If token expired
    """
    is_valid: bool = cache.has(token)
    return is_valid
```

---

## 4. Docstrings and Documentation Rules

### Function Docstrings Format

When docstrings are needed on functions, use this exact format:

```python
"""
DOCSTRING EXPLANATION

:param PARAM_NAME: WHAT IT DOES
:return: WHAT WE RETURN
:raises ERROR_NAME: WHEN WE RAISE
"""
```

- **Always On Separate Lines**: Opening `"""` and closing `"""` must **always** be on their own separate lines (never placed on the same line as the description or content). This applies universally across all docstrings (functions, classes, modules, and exceptions).
- **No empty lines between fields**: `:param:`, `:return:`, and `:raises:` must appear on consecutive lines with zero blank lines between them.
- **Selective docstrings**: Only write docstrings if explaining very important things or non-obvious contracts. Avoid redundant docstrings for trivial, self-explanatory code.
- **Never mention past implementations**: Explain *why* the code works this way *now*, never what it used to do.
- **API Endpoint Functions**: Only include a short description. Do **NOT** include `:param:`.
- **Reverse Proxy / Pass-Through Endpoints**: If an endpoint or function is just a reverse proxy redirecting/forwarding requests without internal business logic, omit `:param:`, `:raises:`, and `:return:`. Write only a brief single-line explanation. Full `:param:`, `:return:`, `:raises:` docstrings apply only when business logic is present.
- **Classes & `__init__`**: Classes get a standard description with opening `"""` on line 1, description on line 2, and closing `"""` on line 3 (no `:param:` or `:return:`). `__init__` methods do **NOT** get a docstring.
- **Indicative Naming**: Never use vague or generic names like `load` or `process`. Use explicit names that explain what is being handled (e.g., `load_customer_billing_history`, `process_credit_card_charge`).

---

## 5. Custom Exceptions

- **Never raise Python base exceptions** (`Exception`, `ValueError`, `KeyError`, `RuntimeError`, etc.).
- Always define and raise custom application exceptions that clearly represent the domain failure.

```python
# GOOD:
class UserNotFoundError(Exception):
    """
    Raised when the specified user ID does not exist in the database.
    """

def fetch_user_by_id(user_id: str) -> UserRecord:
    record: Optional[UserRecord] = db.find(user_id)
    if record is None:
        raise UserNotFoundError(f"User {user_id} was not found.")
    return record

# BAD:
def fetch_user_by_id(user_id: str) -> UserRecord:
    record = db.find(user_id)
    if not record:
        raise ValueError("User not found")  # Never raise base exceptions
    return record
```

---

## 6. Testing Conventions (`pytest`)

Testing is governed by the dedicated **`pytest-conventions`** skill (`skills/pytest-conventions/SKILL.md`). Whenever writing, refactoring, or reviewing tests for Python backend code:

- **Invoke `pytest-conventions`**: Strictly follow all patterns documented in `pytest-conventions`.
- **100% Test Coverage**: All new backend code requires 100% test coverage (pure reverse proxy redirects excepted).
- **Test File Organization**: Mirror source in `tests/MODULE/what_we_test.py`.
- **File Structure**: Imports straight away, then fixtures, then standalone test functions (no test classes, no comments).
- **Execution & Type Verification**:
  - Always run `uv run mypy --strict` (or `mypy --strict`) at the end of each task to verify complete type soundness.
  - Always run tests using `uv run pytest`.
