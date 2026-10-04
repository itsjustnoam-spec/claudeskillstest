---
name: branch-code-review
description: Use when completing tasks, requesting code review, reviewing code changes, reviewing a branch before merge, or when a plan's final whole-branch review is due
---

# Branch Code Review

Review everything a branch adds on top of its base against an explicit checklist
composed of **review rules** and **applicable domain conventions**. The review
runs in an isolated read-only subagent that evaluates the diff item-by-item to
ensure every check is valid.

**Announce at start:** "I'm using the branch-code-review skill to review this branch."

---

## 1. The Review Checklist

The reviewer must evaluate the branch diff against two linked checklists:

### A. Core Review Rules Checklist (`rules.md`)
Located at [`rules.md`](rules.md) in this skill. Contains general software
engineering standards with explicit importance ratings (`Critical`, `Important`,
`Minor`):
- `RULE-001`: Requirements fully implemented
- `RULE-002`: No scope creep
- `RULE-003`: Follow existing codebase patterns
- `RULE-004`: No premature abstraction
- `RULE-005`: Errors are handled, not swallowed
- `RULE-006`: Edge cases a reasonable user would hit
- `RULE-007`: Tests verify real behavior
- `RULE-008`: Orphans cleaned up
- `RULE-009`: Backward compatibility and migrations
- *(Plus any additional rules appended by `code-reviews-analyzer` or team additions)*

*Project Override:* If `<repo>/.claude/review-rules.md` exists in the target repository,
its rules are added to the checklist.

### B. Applicable Domain Conventions Checklist
Based on the file paths in the branch diff (`branch-package` output), include the
matching convention files as mandatory checklist items:

| Changed Files | Active Convention Skill |
|---|---|
| `*.py` | [`skills/python-conventions/SKILL.md`](../python-conventions/SKILL.md) |
| `test_*.py`, `*_test.py`, `conftest.py` | [`skills/pytest-conventions/SKILL.md`](../pytest-conventions/SKILL.md) |
| `*.vue`, `*.ts`, `*.tsx` | [`skills/vue-conventions/SKILL.md`](../vue-conventions/SKILL.md) |

---

## 2. Review Process

1. **Determine Base Branch**:
   Use the base named by the user or plan. Otherwise, run `branch-package` without
   arguments to auto-detect (`origin/HEAD`, `origin/main`, `origin/master`, `main`, or `master`).
2. **Generate Branch Package**:
   From repo root:
   ```bash
   bash skills/branch-code-review/scripts/branch-package [BASE_REF]
   ```
   This generates a package containing commit log, changed paths, stat summary,
   and full diff (`git diff -U10 $(git merge-base <base> HEAD)..HEAD`).
3. **Compile Checklist Inputs**:
   - Inspect the `## Changed paths` section of the generated package.
   - Collect the paths:
     - `rules.md` (from this skill)
     - `<repo>/.claude/review-rules.md` (if present)
     - Relevant convention skill paths (`python-conventions`, `vue-conventions`, `pytest-conventions`)
4. **Dispatch Reviewer Subagent**:
   Dispatch a `general-purpose` subagent using [reviewer-prompt.md](reviewer-prompt.md),
   passing:
   - Package file path
   - Rules checklist path
   - Applicable convention paths
   - Requirements (plan/spec path, or "none — review against rules and conventions only")
   - Any parked/deferred items from the execution ledger to triage
5. **Item-by-Item Verification**:
   The reviewer goes over every item in the rules checklist and convention checklist,
   verifying whether each item is `VALID` or `VIOLATED`.
6. **Act on Findings**:
   - `Critical` findings must be fixed before proceeding.
   - `Important` findings should be resolved before merge.
   - `Minor` findings may be resolved or deferred.
   - When running as part of `subagent-driven-development`'s Final Review:
     Follow that skill's single-fixer wave and scoped re-review, then check
     off `- [x] Final whole-branch review: clean` once resolved.

---

## 3. Extending the Checklist

When new recurring patterns or failure modes are discovered:
- **`code-reviews-analyzer`** can append new `RULE-NNN` entries directly to [`rules.md`](rules.md).
- Domain-specific guidelines are added directly to the relevant convention skill
  ([`python-conventions`](../python-conventions/SKILL.md), [`vue-conventions`](../vue-conventions/SKILL.md)).
- Multi-step workflows or complex engineering patterns should be created as whole
  new skills using [`writing-skills`](../writing-skills/SKILL.md).
