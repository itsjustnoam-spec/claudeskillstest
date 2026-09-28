# Superpowers (Claude Code Edition)

Superpowers is a complete software development methodology for Claude Code, built on top of a set of composable skills and a runtime bootstrap that ensures Claude invokes them automatically.

## How it works

When Claude Code starts up, Superpowers injects process-level guidance:
1. **Brainstorming before coding**: Steps back, asks clarifying questions, presents designs in structured sections, and gets approval before writing any code.
2. **Worktrees & plans**: Sets up clean isolated git worktrees and produces bite-sized, verified implementation plans.
3. **Subagent-Driven Development (SDD) & Inline Execution**: Breaks tasks down and delegates to fresh, isolated subagents with two-stage reviews (spec compliance and code quality) or executes plans methodically inline.
4. **Test-Driven Development (TDD)**: Strictly enforces RED-GREEN-REFACTOR cycles, eliminating unverified code.
5. **Systematic Debugging**: Follows a 4-phase root-cause investigation process rather than guessing.

Because the skills trigger automatically via Claude Code hooks, no special manual invocation is required.

---

## Installation in Claude Code

### From Official Marketplace

```bash
/plugin install superpowers@claude-plugins-official
```

### From Local Directory or Git

To use this repository directly with Claude Code:

```bash
/plugin install /path/to/claudecode
```

Or configure Claude Code plugin settings pointing to this directory.

---

## Local Execution via LiteLLM

If you run Claude Code against local models via a LiteLLM proxy:

1. **Start your LiteLLM proxy** pointing to your local model backend (e.g. Ollama, vLLM, LM Studio).
2. **Configure Claude Code** environment variables before launching:

   ```bash
   export ANTHROPIC_BASE_URL="http://localhost:4000"
   export ANTHROPIC_API_KEY="sk-litellm-dummy-key"
   ```

3. Launch Claude Code:
   ```bash
   claude
   ```

Superpowers skills are model-agnostic and use capability tiers (fast/lightweight, balanced, flagship/reasoning) rather than hardcoded proprietary model identifiers.

---

## The Core Workflow

1. **brainstorming** — Activates before writing code. Explores user intent, asks clarifying questions, presents designs in reviewable sections.
2. **using-git-worktrees** — Activates after design approval. Creates an isolated workspace on a new branch with a clean baseline.
3. **writing-plans** — Breaks designs into bite-sized tasks with explicit verification steps.
4. **subagent-driven-development** or **executing-plans** — Dispatches fresh subagents per task with two-stage reviews, or executes plans systematically inline.
5. **test-driven-development** — Enforces RED-GREEN-REFACTOR cycles.
6. **requesting-code-review** & **receiving-code-review** — Pre-review verification and structured feedback incorporation.
7. **systematic-debugging** — 4-phase root cause process (investigate, hypothesize, test, fix).
8. **verification-before-completion** — Verifies evidence before declaring completion.
9. **finishing-a-development-branch** — Merge, PR, or branch cleanup decisions.

---

## Skills Included

* **Testing & Quality**: `test-driven-development`, `verification-before-completion`
* **Debugging**: `systematic-debugging`
* **Collaboration & Execution**: `brainstorming`, `using-git-worktrees`, `writing-plans`, `executing-plans`, `subagent-driven-development`, `requesting-code-review`, `receiving-code-review`, `finishing-a-development-branch`, `dispatching-parallel-agents`
* **Meta**: `using-superpowers`, `writing-skills`

---

## License

MIT License — see LICENSE for details.
