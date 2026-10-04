---
name: code-reviews-analyzer
description: Use when analyzing GitLab MR review comments, PR reviews, or manual user corrections to Claude to identify recurring mistakes and improve skills, rubrics, or CLAUDE.md
---

# Code Reviews Analyzer

Turn real review feedback into permanent prevention. Ingests comments from
**GitLab Merge Requests** (via the GitLab MCP server) and **manual corrections**
given to Claude during interactive sessions, clusters recurring failure
modes, and proposes concrete, testable updates to project skills, rubrics,
or guidelines.

**Core principle:** If a human had to point it out twice, an agent should have
checked it automatically.

**Announce at start:** "I'm using the code-reviews-analyzer skill to analyze review feedback and propose skill improvements."

---

## 1. Dual-Source Ingestion

The analyzer gathers feedback from two distinct sources:

### Source A: GitLab MR Review Comments (via GitLab MCP)

Use the configured **GitLab MCP server** to fetch review discussions and notes from recent Merge Requests.

1. **Locate Target MR(s)**:
   - If analyzing a specific MR: use its project path/ID and MR IID (e.g. `gitlab-org/project!123`).
   - If doing a periodic review retro: list recent merged or closed MRs using GitLab MCP:
     - `list_merge_requests` (or equivalent tool) with parameters: `state: "merged"` or `state: "opened"`, `per_page: 10`.
2. **Fetch Discussions & Notes**:
   - Call the GitLab MCP tool to retrieve threads:
     - Preferred: `mr_discussions` or `get_merge_request_discussions` (with `project_id` and `merge_request_iid`).
     - Additional: `get_merge_request_notes` for top-level review summaries or bot comments.
   - *Note on MCP tool names*: GitLab MCP implementations may expose `mr_discussions`, `get_merge_request_discussions`, or `get_merge_request_notes`. If a specific tool name is unavailable, inspect the active MCP toolset or fallback to the GitLab CLI (`glab api "projects/:id/merge_requests/$IID/discussions"`).
3. **Extract Comment Data**:
   For each discussion, record:
   - Comment author (human reviewer vs. automated bot like CodeRabbit/GitLab Duo)
   - File path and line number (if inline diff comment)
   - Comment text / suggestion
   - Resolved status and discussion thread replies (to distinguish accepted feedback from rejected/invalid nits)

### Source B: Manual User Corrections to Claude

Pulls conversational corrections where the user had to redirect, correct, or admonish Claude during development sessions.

1. **Extract from Transcripts**:
   Run the bundled extraction script from the repository root:
   ```bash
   node skills/code-reviews-analyzer/scripts/extract-corrections.js [--project <path>] [--since YYYY-MM-DD]
   ```
   This scans session transcripts under `~/.claude/projects/` or `$CLAUDE_CONFIG_DIR/projects/` and outputs candidate corrections paired with Claude's preceding actions to `.superpowers/review-analysis/corrections.md`.
2. **Interactive Manual Input**:
   If transcripts are unavailable (e.g. fresh environment or external chat), ask the user:
   > "Do you have specific recurring corrections or examples of things you find yourself repeatedly telling Claude? (You can paste them here or reference past conversations.)"

---

## 2. Analysis & Root-Cause Clustering

Do not propose rules for one-off personal preferences. Filter and group findings:

### Triage Filter
- **Discard**:
  - One-time business requirement changes or product pivots.
  - Pure stylistic bikeshedding that has no bearing on bugs, architecture, or conventions.
  - Corrections caused by broken external APIs or bad environments.
- **Retain**:
  - Code omissions (missing edge cases, missing error branches, missing cleanup).
  - Architectural defects (tight coupling, unnecessary abstractions, duplicate utilities).
  - Convention violations (incorrect typing, wrong assertions, violation of project rules).
  - Misunderstandings of project constraints or domain models.

### Cluster & Synthesize
Group retained feedback into clusters:
```markdown
| Cluster ID | Theme / Pattern | Occurrences | Sources |
|---|---|---|---|
| PAT-01 | Premature abstraction / extra factory classes | 3 | Manual C1, MR !45 disc 8a |
| PAT-02 | Missing error handling on boundary endpoints | 2 | MR !42 disc 3c, MR !50 disc 9f |
| PAT-03 | Untyped dictionary access in Python backend | 4 | MR !48 disc 1d, Manual C4 |
```

---

## 3. Improvement Target Routing

Every recurring failure maps to the most effective improvement target:

| Improvement Type | Target Destination | When to Choose |
|---|---|---|
| **Branch review checklist rule** | [`skills/branch-code-review/rules.md`](../branch-code-review/rules.md) | Universal code quality, error handling, edge cases, or architecture checks that the reviewer must verify before merge. |
| **Language/domain convention** | [`skills/python-conventions/SKILL.md`](../python-conventions/SKILL.md)<br>[`skills/vue-conventions/SKILL.md`](../vue-conventions/SKILL.md)<br>[`skills/pytest-conventions/SKILL.md`](../pytest-conventions/SKILL.md) | Idiomatic patterns, typing rules, component structure, or test design specific to that tech stack. |
| **Global LLM behavioral rule** | [`CLAUDE.md`](file:///c:/Users/noamr/claudecode/CLAUDE.md) | Fundamental mindset rules (simplicity first, surgical changes, search codebase before writing). |
| **New workflow or technique** | New skill under `skills/<skill-name>/SKILL.md` | When the failure is a multi-step procedure, design pattern, or operational process needing reference examples. Author using [`skills/writing-skills`](../writing-skills/SKILL.md). |

---

## 4. Rule Authoring Standard (from `writing-skills`)

When drafting rules, follow the empirical rules from [`skills/writing-skills`](file:///c:/Users/noamr/claudecode/skills/writing-skills/SKILL.md):

1. **Observable in a diff**:
   - ❌ Bad: "Write clean and maintainable code"
   - ✅ Good: "Validate request bodies at handler entry points; no raw unvalidated dict accesses."
2. **Imperative & Unambiguous**:
   - ❌ Bad: "Consider adding type annotations when helpful."
   - ✅ Good: "All function and method parameters must have explicit type annotations."
3. **Explicit Importance Level**:
   - `Critical`: Causes runtime crash, security bug, or data corruption if missed.
   - `Important`: Architectural defect, missing requirement, swallowed error, test gap.
   - `Minor`: Code style, dead code cleanup, naming polish.
4. **Format for `branch-code-review/rules.md`**:
   ```markdown
   ### RULE-NNN: <Imperative title>
   - **Check:** <Observable condition in code diff>
   - **Why:** <Concrete failure mode or bug that occurs if violated>
   - **Importance:** Critical | Important | Minor
   ```

---

## 5. Execution Workflow

When run, follow these steps without skipping:

1. **Ingest Data**:
   - Query GitLab MCP for MR discussions/notes.
   - Run `extract-corrections.js` or ask user for manual feedback.
2. **Present Summary Table**:
   Show the user what was analyzed: count of MR discussions, count of manual corrections, and identified clusters.
3. **Formulate Concrete Proposals**:
   For each proposed rule or skill change, present:
   - Target destination (`branch-code-review/rules.md`, domain conventions, or a new skill)
   - Exact text / draft to add
   - The concrete problem pattern it solves
4. **User Confirmation Gate**:
   **ALWAYS ask for confirmation before modifying any rule or skill files.**
5. **Apply & Verify**:
   - Apply approved updates to their target locations.
   - If adding to `rules.md`, assign the next available `RULE-NNN` ID.
   - Run existing tests to ensure no format breakage.

---

## Example Interaction

```
User: Please analyze review comments from MR !142 and our last few sessions.

You: I'm using the code-reviews-analyzer skill.

[1. Calling GitLab MCP: mr_discussions for MR !142...]
Found 6 review discussions (3 resolved, 2 bot notes, 1 human discussion).

[2. Running extract-corrections.js...]
Found 4 candidate manual corrections in recent sessions.

### Identified Patterns:
1. Missing null-check on optional user profile metadata (MR !142 disc 3a, Manual C2)
2. Invented custom helper instead of using existing date utility (Manual C1)

### Proposed Improvements:
1. Target: skills/branch-code-review/rules.md
   Add RULE-010: Check optional metadata fields are guarded with .get() or null coalescing.
   Importance: Important

2. Target: CLAUDE.md
   Add reminder under Core Rules: Always search existing date/formatting utilities before writing custom helpers.

Would you like me to apply these updates?
```
