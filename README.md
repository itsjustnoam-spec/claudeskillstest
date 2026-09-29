# Superpowers (Claude Code Edition)

Superpowers is a complete software development methodology for Claude Code, built on top of a set of composable skills and a runtime bootstrap that ensures Claude invokes them automatically.

## How it works

It starts from the moment you fire up Claude Code. As soon as it sees that you're building something, it *doesn't* just jump into trying to write code. Instead, it steps back and asks you what you're really trying to do. 

Once it's teased a spec out of the conversation, it shows it to you in chunks short enough to actually read and digest. 

After you've signed off on the design, your agent puts together an implementation plan that's clear enough for an enthusiastic junior engineer with poor taste, no judgement, no project context, and an aversion to testing to follow. It emphasizes true red/green TDD, YAGNI (You Aren't Gonna Need It), and DRY. 

Next up, once you say "go", it launches a *subagent-driven-development* process, having agents work through each engineering task, inspecting and reviewing their work, and continuing forward. It's not uncommon for your agent to work autonomously for a couple hours at a time without deviating from the plan you put together.

There's a bunch more to it, but that's the core of the system. And because the skills trigger automatically via Claude Code hooks, you don't need to do anything special. Your coding agent just has Superpowers.

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
