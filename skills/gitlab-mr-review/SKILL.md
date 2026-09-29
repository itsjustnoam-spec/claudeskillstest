---
name: gitlab-mr-review
description: Handles GitLab MR review discussions and feedback resolution. Use when user wants to resolve MR comments, handle review feedback, fix review discussions, address MR review, check review status, respond to reviewer, resolve threads, verify MR readiness, review MR comments, analyze review feedback, evaluate MR comments, assess review suggestions, or triage MR discussions. Fetches discussions via GitLab CLI (glab), classifies by severity, applies fixes with user confirmation, commits with proper format, replies to and resolves discussion threads.
---

# GitLab MR review

Resolves Merge Request review comments and discussions with severity-based prioritization, fix application, thread replies, and discussion resolution.

## Current MR

!`glab mr view --json iid,title,state,milestone -q '"MR !\(.iid): \(.title) (\(.state)) | Milestone: \(.milestone.title // "none")"' 2>/dev/null`

## Core workflow

### 1. Fetch, filter, and classify discussions

GitLab groups review comments into **discussions** (threads). Both inline diff comments and general review notes are accessible via the discussions API:

```bash
MR=$(glab mr view --json iid -q '.iid')
LAST_PUSH=$(git log -1 --format=%cI HEAD)

# Fetch all discussions for the current MR
glab api "projects/:id/merge_requests/$MR/discussions?per_page=100" --jq '
  [.[] | {
    discussion_id: .id,
    note_id: .notes[0].id,
    type: .notes[0].type,
    path: (.notes[0].position.new_path // .notes[0].position.old_path // "general"),
    line: (.notes[0].position.new_line // .notes[0].position.old_line // null),
    user: .notes[0].author.username,
    created_at: .notes[0].created_at,
    resolvable: .notes[0].resolvable,
    resolved: .notes[0].resolved,
    replies_count: (.notes | length - 1),
    body: .notes[0].body[0:200]
  }]
'

# Fetch general MR notes / bot overview comments
glab api "projects/:id/merge_requests/$MR/notes?per_page=100" --jq '
  [.[] | select(.system == false and (.body | length > 0)) |
   {id, user: .author.username, created_at, body: .body[0:500]}]
'
```

**Filter unresolved vs resolved**:
- For inline feedback, filter for discussions where `resolvable == true` and `resolved == false`.
- If a discussion is already marked `resolved == true`, treat as "already resolved" in the summary table unless explicitly asked to revisit.

**Filter new vs already-seen**:
- Compare `created_at` with `$LAST_PUSH`. Comments posted after the last push are `new`.
- Mark older unresolved comments as `previous round`.

**Parse bot review bodies (CodeRabbit, GitLab Duo, Danger)**:
For automated review bots, fetch the full review body if truncated:

```bash
# CodeRabbit review bodies
glab api "projects/:id/merge_requests/$MR/notes?per_page=100" --jq '
  [.[] | select(.author.username | startswith("coderabbitai")) |
   {id, created_at, body}]
'
```

CodeRabbit and other bots post structured `<details>` blocks containing outside-diff, duplicate, and nitpick comments. Each block includes file path, line range, severity, and optionally a "Prompt for AI Agents" with pre-built context. See `references/coderabbit_parsing.md` for full parsing guide.

**Use AI prompts when available**:
If a discussion note contains a "Prompt for AI Agents" `<details>` block, use it to understand the issue and suggested approach. Always read the actual code before proposing a fix. If the review summary contains a "Prompt for all review comments with AI agents" block, read it first for cross-comment context.

Classify all comments by severity and process in order: CRITICAL > HIGH > MEDIUM > LOW.

| Severity | Indicators | Action |
|----------|------------|--------|
| CRITICAL | `_🔒 Security_`, `_🚨 Critical_`, `_🔴 Critical_`, GitLab SAST/Vulnerability "Critical", "security", "vulnerability" | Must fix |
| HIGH | `_⚠️ Potential issue_`, `_🐛 Bug_`, `_⚡ Performance_`, `_🟠 Major_`, GitLab Duo "Major" / "High Severity", "High" | Should fix |
| MEDIUM | `_🛠️ Refactor suggestion_`, `_💡 Suggestion_`, "Medium Severity", "Medium" | Recommended |
| LOW | `_🧹 Nitpick_`, `_🔧 Optional_`, `_🟡 Minor_`, `_🔵 Trivial_`, `_⚪ Info_`, "style", "nit", "Low" | Optional |

When a comment has both a type label and a secondary color badge (e.g., `_💡 Suggestion_ | _🟠 Major_`), the color badge is the **binding** severity and overrides the type-based default.

See `references/severity_guide.md` for full detection patterns (GitLab Duo, CodeRabbit emoji, Cursor comments, keyword fallback, related comments heuristics).

### 2. Show review summary table

Before processing, display a structured overview of all comments:

```
| # | Disc ID   | Severity | File:Line          | Type     | Status   | Summary            |
|---|-----------|----------|--------------------|----------|----------|--------------------|
| 1 | 9a8b7c... | CRITICAL | src/auth.py:45     | diff     | new      | SQL injection risk |
| 2 | 1d2e3f... | HIGH     | src/db.py:346-350  | outside  | new      | Missing join cond  |
| 3 | 4g5h6j... | HIGH     | src/chunk.py:188   | duplicate| previous | Stale metadata     |
| 4 | 7k8l9m... | LOW      | tests/test_q.py:12 | nitpick  | previous | Naming convention  |
```

- **Disc ID**: GitLab discussion ID (or note ID for standalone notes)
- **Type**: `diff` (inline diff note), `outside` (outside diff), `duplicate`, `minor`, `nitpick`, or `general` (MR-level note)
- **Status**: `new` (posted after last push), `previous` (earlier round), or `resolved`
- Group related discussions (same file, same root cause, "also applies to" ranges) and note clusters
- Deduplicate: if the same issue appears both as an inline discussion and in a bot overview body, keep one entry and note both sources

If there are **more than 10 comments**, suggest saving a review summary to memory for tracking across sessions. The summary should include: MR IID, discussion IDs, severity, status (new/addressed/deferred/won't fix), and brief description.

### 3. Process each comment

For each comment, in severity order:

1. **Show context**: discussion ID, severity, file:line, quote
2. **Check for AI prompt**: if "Prompt for AI Agents" is available in the note, use it to understand the issue and suggested approach
3. **Check for proposed fix**: if a suggested diff/code block is provided, evaluate it as a starting point (verify correctness)
4. **Read affected code** and propose fix (always inspect actual code)
5. **Handle "also applies to"**: if the comment references additional line ranges, include all locations in the fix
6. **Confirm with user** before applying
7. **Apply fix** if approved
8. **Verify ALL issues** in the comment are addressed (multi-issue comments are common)

### 4. Commit changes

Functional fixes get separate commits, cosmetic fixes are batched:

| Change type | Strategy |
|-------------|----------|
| Functional (CRITICAL/HIGH) | Separate commit per fix |
| Cosmetic (MEDIUM/LOW) | Single batch `style:` commit |

Reference the discussion ID or note ID in the commit body (e.g., `Resolves MR discussion !123 (disc: 9a8b7c)`).

### 5. Reply to and resolve discussions

#### Inline discussions (Diff notes)

GitLab supports replying directly to a discussion thread and marking the entire thread as resolved:

```bash
COMMIT=$(git rev-parse --short HEAD)
MR=$(glab mr view --json iid -q '.iid')

# 1. Reply to the discussion thread
glab api "projects/:id/merge_requests/$MR/discussions/$DISC_ID/notes" \
  -f body="Fixed in $COMMIT. Brief explanation."

# 2. Mark the discussion thread as resolved (if resolvable)
glab api -X PUT "projects/:id/merge_requests/$MR/discussions/$DISC_ID?resolved=true"
```

#### Non-resolvable / MR overview comments

For bot comments embedded in the MR description or general notes that are not resolvable threads:

```bash
glab mr note -m "Fixed in $COMMIT. Addresses outside-diff comment on file/path.py:346-350."
```

**Reply templates** (no emojis, minimal and professional):

| Situation | Template |
|-----------|----------|
| Fixed | `Fixed in [hash]. [brief description of fix]` |
| Won't fix | `Won't fix: [reason]` |
| By design | `By design: [explanation]` |
| Deferred | `Deferred to [issue/task]. Will address in future iteration.` |
| Acknowledged | `Acknowledged. [brief note]` |

### 6. Run tests and push

Run the project test suite. All tests must pass before pushing:

```bash
git push origin HEAD
```

Push all fixes together to minimize CI pipeline runs and review loops.

### 7. Approve MR (optional)

After addressing all comments, if authorized to approve:

```bash
glab mr approve $MR
```

Or to post a summary note of the completed review pass:

```bash
glab mr note -m "All review comments have been addressed and verified."
```

### 8. Verify milestone and labels

```bash
glab mr view $MR --json milestone,labels -q '"Milestone: \(.milestone.title // "none") | Labels: \(.labels | join(", "))"'
```

If the MR has no milestone, check for active milestones:

```bash
glab api "projects/:id/milestones?state=active" --jq '.[].title'
```

If open milestones exist, inform the user and suggest assigning:

```bash
glab mr update $MR --milestone "[milestone-title]"
```

Do **not** assign automatically. This is a reminder only.

## Avoiding review loops

When automated review bots (GitLab Duo, CodeRabbit, Danger) review every push:

1. **Batch fixes**: accumulate all fixes, push once
2. **Draft MR**: mark as draft during fixes (`glab mr update $MR --draft`) to avoid triggering premature review cycles
3. **CI skip keywords**: when making doc/cosmetic-only fixes, use `[skip ci]` in the commit message or `git push -o ci.skip`

## Important rules

- **ALWAYS** fetch both discussions (`merge_requests/$MR/discussions`) and general notes (`merge_requests/$MR/notes`)
- **ALWAYS** check `resolved: false` to target only open, unresolved discussions
- **ALWAYS** resolve discussion threads via API (`?resolved=true`) after addressing them
- **ALWAYS** show the review summary table before processing
- **ALWAYS** confirm before modifying files
- **ALWAYS** verify ALL issues in multi-issue comments are fixed, including "also applies to" ranges
- **ALWAYS** run tests before pushing
- **ALWAYS** reply to resolved threads using standard templates
- **ALWAYS** check milestone at the end and remind if missing
- **ALWAYS** suggest saving a review summary to memory when there are more than 10 comments
- **NEVER** use emojis in commit messages or thread replies
- **NEVER** skip HIGH/CRITICAL comments without explicit user approval
- **NEVER** resolve a discussion thread without fixing the issue or getting explicit user agreement
- **NEVER** assign milestone automatically - suggest only
- **Functional fixes** -> separate commits (one per fix)
- **Cosmetic fixes** -> batch into single `style:` commit
- **Duplicate comments** -> treat as higher priority than their label (issue was already flagged before)
- **Related comments** -> group and fix together when they share root cause or file context

## References

- `references/severity_guide.md` - Severity detection patterns (GitLab Duo, CodeRabbit emoji, Cursor comments, keyword fallback, related comments heuristics)
- `references/coderabbit_parsing.md` - CodeRabbit review structure on GitLab, section parsing, "Prompt for AI Agents" usage, duplicate and "also applies to" handling
