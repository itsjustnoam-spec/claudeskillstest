---
name: writing-plans
description: Use when you have a spec or requirements for a multi-step task, before touching code
---

# Writing Plans

## Overview

Write implementation plans for an engineer who has not seen this codebase or this spec. Assume they write idiomatic code in the project's language once they know the exact interface and the exact test, and that they will make a reasonable choice wherever the plan leaves one open. What they cannot know is what you decided: which files, which names and signatures, which values from the spec, which tests prove each task. Document those. Give them the whole plan as bite-sized tasks. DRY. YAGNI. Frequent commits.

**Announce at start:** "I'm using the writing-plans skill to create the implementation plan."

**Context:** If working in an isolated worktree, it should have been created via the `superpowers:using-git-worktrees` skill at execution time.

**Save plans to:** `docs/superpowers/plans/YYYY-MM-DD-<feature-name>.md`
- (User preferences for plan location override this default)

## Scope Check

If the spec covers multiple independent subsystems, it should have been broken into sub-project specs during brainstorming. If it wasn't, suggest breaking this into separate plans — one per subsystem. Each plan should produce working, testable software on its own.

## File Structure

Before defining tasks, map out which files will be created or modified and what each one is responsible for. This is where decomposition decisions get locked in.

- **Search Existing Patterns First:** Actively search the codebase for already-existing patterns, conventions, directory layouts, and implementations before proposing new ones. Replicate established codebase patterns rather than inventing new structures, utilities, or abstractions.
- Design units with clear boundaries and well-defined interfaces. Each file should have one clear responsibility.
- You reason best about code you can hold in context at once, and your edits are more reliable when files are focused. Prefer smaller, focused files over large ones that do too much.
- Files that change together should live together. Split by responsibility, not by technical layer.
- In existing codebases, follow established patterns. If the codebase uses large files, don't unilaterally restructure - but if a file you're modifying has grown unwieldy, including a split in the plan is reasonable.

This structure informs the task decomposition. Each task should produce self-contained changes that make sense independently.

## Task Right-Sizing

A task is the smallest unit that delivers a cohesive change and is worth a
fresh reviewer's gate. When drawing task boundaries: fold setup,
configuration, scaffolding, and documentation steps into the task whose
deliverable needs them; split only where a reviewer could meaningfully
reject one task while approving its neighbor. Each task ends with an
independently verifiable deliverable.

**Subagent Test Responsibility:**
Subagents implementing feature tasks do NOT need to write or add new tests.
Their responsibility is implementing the requested functionality and ensuring
that lint and existing tests pass at the end of their task without regressions.

**Final Test Task:**
Every plan MUST end with a final, dedicated task whose specific purpose is to
add new unit and integration tests covering all features, interfaces, and
edge cases implemented across Tasks 1..N-1. For Python projects, this task
must explicitly invoke and adhere to `pytest-conventions` (100%
coverage, AAA structure, parametrization, fixture factories, and isolation).

## Exact Success Predicates

Every task in a generated plan must include an exact success predicate: a single quantified, checkable completion condition.

**Why:** Under persistence pressure, implementers often produce "answer-shaped near misses" (mocking complex logic instead of implementing it, omitting edge-case error branches, or writing vacuous test assertions). An exact success predicate eliminates ambiguity by defining a concrete, falsifiable condition that proves the task is genuinely complete and functionally verified.

**Rules for Success Predicates:**
- **Quantified & checkable:** A single condition that can be objectively evaluated (e.g. command output, exit code, count of passing tests, or clean linting check).
- **For implementation tasks:** The predicate confirms the implementation is in place and that lint + existing tests pass cleanly without regressions or warnings (e.g. `npm run lint && npm test` passes with 0 errors).
- **For the final test task:** The predicate confirms that new comprehensive tests are added and that lint + all tests pass with quantified assertions covering newly implemented features and error paths.
- **No answer-shaped near misses:** Explicitly forbid mocking or stubbing out the core logic under test, skipping edge-case error branches, or writing vacuous assertions (like asserting true or checking mock call counts instead of actual data).

## Step Granularity

**Each step is one action with a checkable result:**

For implementation tasks:
- "Implement the code" - step
- "Run lint and tests to verify they pass" - step
- "Commit" - step

For the final test task:
- "Write new tests" - step
- "Run lint and test suite to verify all pass" - step
- "Commit" - step

## Plan Document Header

**Every plan MUST start with this header:**

```markdown
# [Feature Name] Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** [One sentence describing what this builds]

**Architecture:** [2-3 sentences about approach]

**Tech Stack:** [Key technologies/libraries]

**Spec:** [path to the spec/design doc this plan implements — the plan
argues from the spec, so the spec travels with it; executors read both]

## Global Constraints

[The spec's project-wide requirements — version floors, dependency limits,
naming and copy rules, platform requirements — one line each, with exact
values copied verbatim from the spec. Every task's requirements implicitly
include this section.]

## Review Focus

[The five input classes or failure modes the spec implies that are most
likely to bite a person using this software — one line each, naming the
input or condition and the behavior a reasonable person would expect, most
likely first. The spec is a vision document: it says what the software must
do, not everything it will meet, and its silence on an input is not
permission for that input to break the program. Write the list here, once,
with the spec in front of you. The final task of the plan will add new tests
covering these cases.]

---
```

## Task Structure

### Standard Implementation Task Template (Tasks 1..N-1):

````markdown
### Task N: [Component Name]

**Files:**
- Create: `exact/path/to/file.py`
- Modify: `exact/path/to/existing.py:123-145`

**Interfaces:**
- Consumes: [what this task uses from earlier tasks — exact signatures]
- Produces: [what later tasks rely on — exact function names, parameter
  and return types. A task's implementer sees only their own task; this
  block is how they learn the names and types neighboring tasks use.]

**Success Predicate:** [A single quantified, checkable completion condition — e.g. `npm run lint && npm test` passes with 0 lint errors, 0 test failures, and 0 warnings]

- [ ] **Step 1: Implement `function(input: InputType) -> ResultType` in `exact/path/to/file.py`**

One line on the approach when the signature leaves a choice (which library call, which data structure); a code block only for an algorithm they do not determine.

- [ ] **Step 2: Run lint and existing tests to verify they pass**

Run: `npm run lint && npm test`
Expected: 0 lint errors, all existing tests pass

- [ ] **Step 3: Commit**

```bash
git add src/path/file.py
git commit -m "feat: implement specific feature"
```
````

### Final Test Task Template (Task N - Latest Task in Plan):

````markdown
### Task N: Add New Tests for [Feature Name]

**Files:**
- Create: `tests/exact/path/to/test.py`
- Modify: `tests/existing_test.py` (if applicable)

**Purpose:** Add comprehensive new tests for all functionality and interfaces implemented across Tasks 1..N-1, covering success paths, edge cases, and error branches.

**Success Predicate:** [A single quantified, checkable completion condition — e.g. `pytest tests/path/test.py -v` passes with N non-mock test cases verifying real behavior and edge cases, plus lint passes clean with 0 warnings]

- [ ] **Step 1: Write unit and integration tests in `tests/path/test.py`**

```python
def test_specific_behavior():
    result = function(input)
    assert result == expected

def test_edge_case_error():
    with pytest.raises(SpecificError):
        function(bad_input)
```

- [ ] **Step 2: Run lint and full test suite to verify they pass**

Run: `pytest -v && ruff check .`
Expected: All tests pass, 0 lint errors

- [ ] **Step 3: Commit**

```bash
git add tests/path/test.py
git commit -m "test: add unit and integration tests for [feature name]"
```
````

## What a Step Contains

A step is done when the implementer can write exactly one reasonable thing
from it. That is the whole requirement: unambiguous, not complete. Each kind
of step carries what makes it unambiguous and nothing more:

- **A code step:** the exact signature (name, parameters, return type), the
  file it lives in, and the specific values the spec pins. The implementer
  writes the body. A body appears only for an algorithm the signature and
  interfaces do not determine, or for exact copy the spec fixes.
- **A verification step (lint + tests):** the commands to run lint and tests,
  and the expected output confirming clean execution and zero regressions.
- **A test-writing step (in the final task):** the test's name and its assertions,
  as code, with the spec's exact values in them.
- **A reference to another task:** that task's Interfaces block says what
  to use; the plan does not repeat that task's code.

A plan is the set of decisions the implementer cannot make alone. A plan
longer than the code it describes has written the code instead. Lines that
decide nothing ("TBD", "handle edge cases", "add appropriate validation",
"write tests for the above", a type or function no task defines) are the
opposite failure, and the self-review catches both.

## Self-Review

After writing the complete plan, look at the spec with fresh eyes and check the plan against it. This is a checklist you run yourself — not a subagent dispatch.

**1. Spec coverage:** Skim each section/requirement in the spec. Can you point to a task that implements it? List any gaps.

**2. Step scan:** Every step must let the implementer write exactly one reasonable thing, and no step may carry more than that: a line that decides nothing is a gap, a function body the signature and tests already determine is a transcript. Fix both.

**3. Type consistency:** Do the types, method signatures, and property names you used in later tasks match what you defined in earlier tasks? A function called `clearLayers()` in Task 3 but `clearFullLayers()` in Task 7 is a bug.

**4. Review Focus:** For each input class or failure mode the spec implies, are they covered by the tests in the final test task?

**5. Proportion:** Compare the plan's length to the spec's. A plan several times longer than the spec it implements is a transcript of the program, not a plan. If code blocks are most of the document, replace bodies with signatures, test names and assertions, and check that each step is still unambiguous.

**6. Success Predicates:** Does every task include an exact success predicate — a single quantified, checkable completion condition? Does each predicate prevent answer-shaped near misses (mocking complex logic instead of implementing it, omitting edge-case error branches, or writing vacuous test assertions)?

**7. Final Test Task:** Is the latest task in the plan dedicated to adding new tests covering the newly implemented features and edge cases, while earlier tasks focus on implementation and verifying lint + existing tests pass?

If you find issues, fix them inline. No need to re-review — just fix and move on. If you find a spec requirement with no task, add the task.

## Execution Handoff

After saving and self-reviewing the plan, link it for your human partner
to read. Always select subagent-driven development as the execution method.

**"Plan complete and saved to `docs/superpowers/plans/<filename>.md`. Proceeding with execution using subagent-driven development."**

- **REQUIRED SUB-SKILL:** Use superpowers:subagent-driven-development
