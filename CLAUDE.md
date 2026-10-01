# CLAUDE.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

---

# Project Conventions

## Core Rules
- **Search Existing Codebase Patterns First**: Always search for existing patterns and implementations in the codebase before writing new code. Replicate existing patterns rather than inventing new structures, helpers, or abstractions.
- **Strict Domain Separation**: Do not mix backend conventions into frontend tasks, nor frontend conventions into backend tasks. Keep context scoped and focused.

## Domain Guidance
- **Python Backend**: When working on backend tasks (Python, services, APIs, models, backend utilities, scripts):
  - Always invoke and adhere to the `python-conventions` skill (`skills/python-conventions/SKILL.md`).
  - Do NOT load or reference frontend conventions.
- **Python Testing**: When writing, updating, or reviewing tests in Python (`pytest`):
  - Always invoke and adhere to the `pytest-conventions` skill (`skills/pytest-conventions/SKILL.md`).
- **Vue / TypeScript Frontend**: When working on frontend tasks (Vue 3, Vuetify, TypeScript, Tailwind CSS, components, stores, frontend tests):
  - Always invoke and adhere to the `vue-conventions` skill (`skills/vue-conventions/SKILL.md`).
  - Do NOT load or reference backend conventions.
