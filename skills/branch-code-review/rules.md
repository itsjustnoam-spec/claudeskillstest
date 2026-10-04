# Code Review Rules Checklist

These rules form the core review checklist for every branch. Reviewers must go
over every rule in this checklist and explicitly verify compliance against the diff.

New rules discovered from review analysis or team feedback should be appended
here with the next sequential ID and clear importance.

---

### RULE-001: Requirements fully implemented
- **Check:** Every requirement in the plan/spec/MR description has corresponding implementation; nothing is mocked out, stubbed, or left as TODO.
- **Why:** Incomplete implementations pass superficial inspection and break downstream work.
- **Importance:** Critical

### RULE-002: No scope creep
- **Check:** Every changed line traces directly to the requested feature or fix. No unrequested features, unnecessary configurability, or drive-by refactoring of unrelated code.
- **Why:** Unrelated edits enlarge the diff, introduce subtle regressions, and complicate rollbacks.
- **Importance:** Important

### RULE-003: Follow existing codebase patterns
- **Check:** New code reuses existing helpers, abstractions, patterns, and conventions from this codebase instead of inventing parallel structures.
- **Why:** Fragmented patterns cause technical debt and make maintenance difficult.
- **Importance:** Important

### RULE-004: No premature abstraction
- **Check:** No speculative interfaces, factories, base classes, or helpers for single-use code. No error handling for impossible states.
- **Why:** Premature abstraction adds cognitive overhead without delivering value.
- **Importance:** Important

### RULE-005: Errors are handled, not swallowed
- **Check:** Errors and exceptions are caught at the right boundary with actionable messages; no bare `except`/empty `catch` blocks; no silent fallbacks that conceal broken state.
- **Why:** Swallowed errors disguise bugs as successful execution and cause corrupted data later.
- **Importance:** Critical

### RULE-006: Edge cases a reasonable user would hit
- **Check:** Handles empty collections, missing keys, duplicate values, boundary conditions, and unexpected inputs sensibly even when the spec was silent.
- **Why:** A spec's silence on an input is not permission for the program to crash.
- **Importance:** Important

### RULE-007: Tests verify real behavior
- **Check:** New functionality is accompanied by tests that make concrete assertions on actual outputs; no vacuous assertions, no mock verification in place of testing real logic.
- **Why:** Superficial tests provide false confidence while letting bugs slip into production.
- **Importance:** Critical

### RULE-008: Orphans cleaned up
- **Check:** Unused imports, orphaned helper functions, dead variables, or unreferenced files created or made obsolete by this change are removed. (Do not touch pre-existing dead code).
- **Why:** Dead code clutters the codebase and misleads subsequent maintainers.
- **Importance:** Minor

### RULE-009: Backward compatibility and migrations
- **Check:** Schema, API, configuration, or CLI changes preserve backward compatibility or provide an explicit migration path.
- **Why:** Unannounced breaking changes cause production outages.
- **Importance:** Critical

<!-- New project-wide review rules from code-reviews-analyzer or team guidelines are appended below -->
