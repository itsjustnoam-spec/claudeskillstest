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
  - **Ignore** mypy's "missing return type annotation" errors on functions that return None ג€” the no-`-> None` rule takes precedence. Never add `-> None` to silence mypy.

```python
# GOOD:
def save_user_profile(user_id: str, email: str):
    user_record: dict[str, str] = {"id": user_id, "email": email}
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

Section lines use the exact format, with the section name **always capitalized**:
```python
# ----- SECTION_NAME ----- #
```
Standard section names: `Imports`, `Consts`, `Classes`, `Functions` (and other domain-specific sections as needed, e.g. `Routes`). Omit sections that would be empty.

### Strict Spacing Rules

1. `# ----- Imports ----- #`:
   - Placed **straight after the closing (2nd) `"""`** of the page docstring, on the very next line ׳’ג‚¬ג€ **0 blank lines** in between.
   - Exactly **1 blank line** below the section line before imports start.
2. `# ----- Consts ----- #`:
   - Exactly **1 blank line** above the section line.
   - Exactly **1 blank line** below the section line.
3. `# ----- Classes ----- #` and `# ----- Functions ----- #`:
   - Exactly **1 blank line** above the section line.
   - Exactly **2 blank lines** below the section line.

### `__init__.py` Files

- Do **NOT** define `__all__` in application packages (only acceptable in a reusable public library where restricting the interface is mandatory).
- Omit empty banner sections.

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
- **Description Sentence**: The description is a short, concise sentence explaining what the function does, ending with a period (`.`). It must **never** mention raising errors (e.g. no "or raise an error if not found") ׳’ג‚¬ג€ exceptions are documented exclusively in `:raises:`.
- **API Endpoint Functions**: Only the description. Do **NOT** include `:param:`, `:return:`, or `:raises:`.
- **Reverse Proxy / Pass-Through Endpoints**: If an endpoint or function is just a reverse proxy redirecting/forwarding requests without internal business logic, omit `:param:`, `:raises:`, and `:return:`. Write only a brief single-line explanation. Full `:param:`, `:return:`, `:raises:` docstrings apply only when business logic is present.
- **Classes & `__init__`**: Classes get a standard description with opening `"""` on line 1, description on line 2, and closing `"""` on line 3 (no `:param:` or `:return:`). `__init__` methods do **NOT** get a docstring.
- **Indicative Naming**: Never use vague or generic names like `load` or `process`. Use explicit names that explain what is being handled (e.g., `load_customer_billing_history`, `process_credit_card_charge`).

---

## 5. Explicit Condition Checks

Never use truthy/falsy checks (`if not x:` / `if x:`) unless `x` is a genuine `bool`.

- Checking for None: `if x is None:` / `if x is not None:`
- Checking for an empty collection or string: `if len(x) == 0:` / `if len(x) > 0:`

```python
# GOOD:
if project is None:
    raise ProjectNotFoundError(f"Project {project_id} was not found.")
if len(features) == 0:
    return
if is_active:
    activate_session(session)

# BAD:
if not project:  # project is not a bool
    raise ProjectNotFoundError(f"Project {project_id} was not found.")
if not features:  # use len(features) == 0
    return
```

---

## 6. Multiline Calls

- A call (function call, constructor, decorator, `raise SomeError(...)`) **must** put each argument on its own line, with a trailing comma, when:
  - It has **3 or more arguments**, **or**
  - The line's content (excluding leading indentation) is **50+ characters** long.
- Otherwise keep it on a single line.

```python
# GOOD:
session.add(record)
raise HTTPException(
    status_code=status.HTTP_404_NOT_FOUND,
    detail=str(error),
)

# BAD:
raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(error))
```

---

## 7. Custom Exceptions

- **Never raise Python base exceptions** (`Exception`, `ValueError`, `KeyError`, `RuntimeError`, etc.).
- Always define and raise custom application exceptions that clearly represent the domain failure.
- Custom exception class names **must** end with `Error` (e.g. `NotFoundError`, `DatabaseTransactionError`, never `NotFound`).

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

## 8. Testing Conventions (`pytest`)

Testing is governed by the dedicated **`pytest-conventions`** skill (`skills/pytest-conventions/SKILL.md`). Whenever writing, refactoring, or reviewing tests for Python backend code:

- **Invoke `pytest-conventions`**: Strictly follow all patterns documented in `pytest-conventions`.
- **100% Test Coverage**: All new backend code requires 100% test coverage (pure reverse proxy redirects excepted).
- **Test File Organization**: Mirror source in `tests/MODULE/what_we_test.py`.
- **File Structure**: Imports straight away, then fixtures, then standalone test functions (no test classes, no comments).
- **Execution & Type Verification**:
  - Always run `uv run mypy --strict` (or `mypy --strict`) at the end of each task to verify complete type soundness.
  - Always run tests using `uv run pytest`.
