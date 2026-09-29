# Severity guide for GitLab MR reviews

Reference guide for interpreting severity levels from automated review comments and discussions (GitLab Duo, CodeRabbit, Cursor, and SAST/Security scanners).

## Severity Levels

### CRITICAL
**Meaning**: Must be fixed before merge. Indicates:
- Security vulnerabilities (SQLi, XSS, RCE, credential leak)
- Data loss or corruption risks
- Logic errors causing catastrophic failures
- Infinite loops or deadlocks
- Resource exhaustion or crash loops

**Action**: Stop and fix immediately. Blocks MR merge.

---

### HIGH
**Meaning**: Should be fixed before merge. Indicates:
- Performance bottlenecks (unindexed queries, O(n²) hotpaths)
- Error handling gaps causing unhandled exceptions
- Race conditions or concurrency hazards
- Missing validation on critical paths

**Action**: Address before merge unless there is explicit approval to defer.

---

### MEDIUM
**Meaning**: Recommended fix. Indicates:
- Code maintainability or readability issues
- Minor refactoring opportunities
- Unreachable/dead code
- Duplicated logic
- Edge case omission without system-wide impact

**Action**: Address if time permits, or create a tracked follow-up issue.

---

### LOW
**Meaning**: Optional improvement. Indicates:
- Formatting and style preferences
- Import ordering
- Naming conventions
- Documentation or comment suggestions

**Action**: Optional. Can be batched into a style commit or skipped with justification.

---

## Detection Patterns

### GitLab Duo & Security Scanner Detection
GitLab CI security scanners (SAST, Secret Detection, Dependency Scanning) and GitLab Duo Code Review output structured severity labels in discussions:

```
[Critical] / [Severity: Critical] → CRITICAL
[High]     / [Severity: High]     → HIGH
[Medium]   / [Severity: Medium]   → MEDIUM
[Low]      / [Severity: Low]      → LOW
[Info]     / [Severity: Info]     → LOW
```

### CodeRabbit Detection
CodeRabbit uses emoji + italic text: `_<emoji> <label>_` or `_<emoji> <label>_ | _<color> <severity>_`.

#### Primary Type Labels

| Comment pattern | Severity |
|----------------|----------|
| `_🔒 Security_` or `_🚨 Critical_` | CRITICAL |
| `_⚠️ Potential issue_` | HIGH |
| `_🐛 Bug_` | HIGH |
| `_⚡ Performance_` | HIGH |
| `_🛠️ Refactor suggestion_` | MEDIUM |
| `_💡 Suggestion_` | MEDIUM |
| `_🧹 Nitpick_` | LOW (only in assertive mode) |
| `_🔧 Optional_` | LOW (skip by default) |

#### Secondary Color Badges (Binding Override)
When present, the secondary badge overrides the primary type default:

| Secondary badge | Official name | Maps to |
|----------------|---------------|---------|
| `_🔴 Critical_` | Critical | CRITICAL |
| `_🟠 Major_` | Major | HIGH |
| `_🟡 Minor_` | Minor | LOW |
| `_🔵 Trivial_` | Trivial | LOW (skip by default) |
| `_⚪ Info_` | Info | LOW (informational, no action needed) |

### Cursor Comments
```
<!-- **High Severity** --> → HIGH
<!-- **Medium Severity** --> → MEDIUM
```

### Keyword Detection (Fallback)
When explicit badges, severity tags, or HTML comments are not present, infer from keywords:

| Keywords | Severity |
|----------|----------|
| security, vulnerability, injection, XSS, SQL, token, secret | CRITICAL/HIGH |
| dangerous, exploit, overflow, crash | CRITICAL |
| performance, bottleneck, slow, leak | HIGH |
| error handling, uncaught, unhandled exception | HIGH |
| unreachable, dead code, unused | MEDIUM |
| refactor, simplify, consolidate | MEDIUM |
| style, formatting, naming, lint | LOW |
| whitespace, typo, comment wording | LOW |

---

## Related Comments Detection

Comments in a GitLab MR are often related when:

1. **Consequence relationship**: Discussion B is a consequence of fixing Discussion A (e.g., fixing exception handling in a function makes an `except` block in the same file unreachable).
2. **Same root cause**: Multiple discussions about the same underlying bug across different files or functions.
3. **Same file cluster**: Multiple comments within ~50 lines of the same file.

**Resolution Strategy**: Fix the root cause / CRITICAL discussion first. Verify whether related MEDIUM/LOW comments are automatically resolved before making unnecessary edits.

---

## GitLab Discussion Resolution Rules

1. **Never resolve prematurely**: Do NOT mark a discussion as resolved (`?resolved=true`) until the code fix has been verified locally and committed.
2. **Always reply before resolving**: Post a concise reply note explaining the resolution and referencing the commit hash before closing the thread.
3. **Handle Won't Fix / By Design**: If a comment is rejected after consulting the user, reply with the technical reasoning and resolve the thread to unblock MR merge gates.
