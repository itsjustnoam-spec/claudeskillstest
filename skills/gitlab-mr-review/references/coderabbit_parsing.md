# CodeRabbit review parsing for GitLab

Guide for extracting and processing all comment types from CodeRabbit GitLab MR reviews.

## Review structure on GitLab

CodeRabbit on GitLab posts feedback in two primary forms:
1. **MR Notes (Overview & Summary)**: A general MR-level note via `projects/:id/merge_requests/$MR/notes` containing the overarching review summary and collapsible sections.
2. **Inline Discussions**: Threaded discussions directly on diff lines via `projects/:id/merge_requests/$MR/discussions`.

The review summary body follows this structure:

```
Actionable comments posted: N

> [!CAUTION]
> Some comments are outside the diff and can't be posted inline...

<details>
<summary>⚠️ Outside diff range comments (N)</summary>
  (actionable comments on code outside the MR diff)
</details>

<details>
<summary>♻️ Duplicate comments (N)</summary>
  (issues already flagged in a previous review)
</details>

<details>
<summary>🟡 Minor comments (N)</summary>
  (lower severity comments grouped to reduce inline noise)
</details>

<details>
<summary>🧹 Nitpick comments (N)</summary>
  (style/convention issues, lowest priority)
</details>

<details>
<summary>🤖 Prompt for all review comments with AI agents</summary>
  (global prompt covering all comments in this review)
</details>

<!-- Informational sections (not actionable, ignore): -->
<details><summary>ℹ️ Review info</summary></details>
<details><summary>⚙️ Run configuration</summary></details>
<details><summary>📥 Commits</summary></details>
<details><summary>⛔ Files ignored due to path filters (N)</summary></details>
<details><summary>📒 Files selected for processing (N)</summary></details>
<details><summary>🚧 Files skipped from review as they are similar to previous changes (N)</summary></details>
```

Not all sections are always present. CodeRabbit only includes sections that have comments. Other severity-based sections (e.g., "🔴 Critical comments", "🟠 Major comments") may also appear.

## Fetching CodeRabbit reviews via glab

```bash
MR=$(glab mr view --json iid -q '.iid')

# Get all CodeRabbit MR note bodies
glab api "projects/:id/merge_requests/$MR/notes?per_page=100" --jq '
  [.[] | select(.author.username | startswith("coderabbitai")) |
   {id, created_at, body}]
'

# Get all CodeRabbit inline discussions
glab api "projects/:id/merge_requests/$MR/discussions?per_page=100" --jq '
  [.[] | select(.notes[0].author.username | startswith("coderabbitai")) |
   {id, note_id: .notes[0].id, path: .notes[0].position.new_path, line: .notes[0].position.new_line, resolvable: .notes[0].resolvable, resolved: .notes[0].resolved, body: .notes[0].body[0:200]}]
'
```

## Parsing sections from the body

Each section is a `<details>` block. Extract them by matching the summary text:

| Summary pattern | Comment type | Default severity |
|----------------|--------------|-----------------|
| `⚠️ Outside diff range comments` | Code outside the MR diff | Use per-comment severity |
| `♻️ Duplicate comments` | Already flagged in previous reviews | Use per-comment severity |
| `🟡 Minor comments` | Lower severity, grouped to reduce noise | MEDIUM/LOW (use per-comment) |
| `🧹 Nitpick comments` | Style/convention issues | LOW |
| `🤖 Prompt for all review comments with AI agents` | Global AI context prompt | N/A (not a comment) |

Treat any unrecognized `<details>` section with comments as actionable and classify by per-comment severity.

Informational sections (`ℹ️ Review info`, `⚙️ Run configuration`, `📥 Commits`, `⛔ Files ignored`, `📒 Files selected`, `🚧 Files skipped`) are not actionable. Ignore them.

### Per-comment structure inside sections

Inside file groups, individual comments follow this pattern:

```markdown
`X-Y`: _<emoji> <type>_ | _<color> <severity>_

**Title text**

Description paragraph(s)...

As per coding guidelines, `path/**`: "quote..."    (optional, references project rules)

Also applies to: X-Y, X-Y    (optional, other line ranges with same issue)

<details><summary>Proposed fix</summary>
```lang
code suggestion
```
</details>

<details><summary>Prompt for AI Agents</summary>
prompt text...
</details>
```

Key fields to extract:
- **File path**: from the `<details><summary>` wrapping the file group
- **Line range**: backtick-formatted `` `X-Y` `` at the start of each comment (or from diff note position)
- **Severity**: emoji + type label and optional color severity (see `severity_guide.md`)
- **Title**: bold text after the severity line
- **"Also applies to"**: additional line ranges in the same file with the same issue
- **Proposed fix / Suggested fix**: code suggestion inside `<details>`. Match any `<details>` block whose summary contains "fix", "suggest", "proposed", or "optional"
- **Prompt for AI Agents**: per-comment context prompt inside `<details>`

## Using the "Prompt for AI Agents"

CodeRabbit provides two levels of AI prompts:

### Per-comment prompt
Inside each comment's `<details><summary>Prompt for AI Agents</summary>` block. Contains:
- Specific file and line range
- Issue description with context
- References to coding guidelines or project conventions
- Suggested fix approach

### Global prompt
At the bottom of the review body, inside `<details><summary>Prompt for all review comments with AI agents</summary>`. Contains:
- Aggregated context for all comments in the review
- File paths, line ranges, and descriptions for every comment
- Useful for batch understanding across related discussions

**How to use these prompts**:
1. When processing a discussion, check if it has a per-comment prompt
2. If present, use it to understand the issue and suggested approach
3. Always read the actual code before proposing a fix
4. For batch processing, use the global prompt to understand all issues at once

## Resolving discussions in GitLab

Unlike GitHub where comments are just threads, GitLab discussions have an explicit **resolved** state:

```bash
# Reply to note in discussion
glab api "projects/:id/merge_requests/$MR/discussions/$DISC_ID/notes" \
  -f body="Fixed in $COMMIT. Brief explanation."

# Mark discussion thread as resolved
glab api -X PUT "projects/:id/merge_requests/$MR/discussions/$DISC_ID?resolved=true"
```

## "Also applies to" handling

Some comments include `Also applies to: 258-266, 291-296`. These indicate the same issue exists at multiple locations in the same file. When fixing:

1. Fix the primary location (the one with the full description)
2. Apply the same fix pattern to all "also applies to" ranges
3. Verify each location, as the exact code may differ slightly

## Duplicate comments

Comments in the "Duplicate comments" section were already flagged in a previous review. They reappear because the underlying issue was not fixed. Treat them as:

- Same severity as indicated in their label
- Higher actual priority than their label suggests (reviewer is repeating themselves)
- Check if they were previously deferred or missed

## Configuration reference

CodeRabbit behavior is controlled via `.coderabbit.yaml` in the repo root:

```yaml
reviews:
  profile: "chill"                      # chill (default) or assertive (includes nitpicks)
  enable_prompt_for_ai_agents: true     # includes "Prompt for AI Agents" in comments
```

- `chill`: lighter feedback, nitpick sections are hidden
- `assertive`: full feedback, includes nitpick and minor comments
