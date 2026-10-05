#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
HOOK_UNDER_TEST="$REPO_ROOT/hooks/stop-hook"
WRAPPER_UNDER_TEST="$REPO_ROOT/hooks/run-hook.cmd"
ACTIVE_PLAN="$REPO_ROOT/hooks/active-plan.js"

FAILURES=0
TEST_ROOT="$(mktemp -d)"
unset CLAUDE_SESSION_ID CLAUDE_CODE_SESSION_ID PLAN_FILE RALPH_PLAN || true

cleanup() {
    rm -rf "$TEST_ROOT"
}
trap cleanup EXIT

pass() {
    echo "  [PASS] $1"
}

fail() {
    echo "  [FAIL] $1"
    FAILURES=$((FAILURES + 1))
}

# make_repo NAME — a git repo with docs/superpowers/plans/feature.md read from stdin
make_repo() {
    local proj="$TEST_ROOT/$1"
    mkdir -p "$proj/docs/superpowers/plans"
    cat > "$proj/docs/superpowers/plans/feature.md"
    git -C "$proj" init -q
    git -C "$proj" -c user.email=t@t -c user.name=t add -A
    git -C "$proj" -c user.email=t@t -c user.name=t commit -qm init
    printf '%s\n' "$proj"
}

# register DIR [SESSION] — register DIR's plan as active (optionally bound to SESSION)
register() {
    (cd "$1" && CLAUDE_SESSION_ID="${2:-}" node "$ACTIVE_PLAN" start docs/superpowers/plans/feature.md >/dev/null)
}

# run_hook DIR MESSAGE [SESSION]
run_hook() {
    local payload
    payload=$(node -e 'console.log(JSON.stringify({stop_hook_active: false, cwd: process.argv[1], session_id: process.argv[3], last_assistant_message: process.argv[2]}));' "$1" "$2" "${3:-s1}")
    printf '%s' "$payload" | bash "$HOOK_UNDER_TEST" 2>&1
}

is_block() {
    node -e '
const data = JSON.parse(require("fs").readFileSync(0, "utf8"));
if (data.decision !== "block") process.exit(1);
if (process.argv[1] && !data.reason.includes(process.argv[1])) { console.error(data.reason); process.exit(1); }
' "${1:-}"
}

echo "=== Stop Hook Tests ==="

# 1. Registration shape in hooks.json
if node -e '
const hooks = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
const entry = hooks.hooks.Stop[0].hooks[0];
if (entry.shell !== "bash") process.exit(1);
if (!/run-hook\.cmd" stop-hook$/.test(entry.command)) process.exit(1);
' "$REPO_ROOT/hooks/hooks.json"; then
    pass "hooks.json registers Stop with shell:bash dispatch"
else
    fail "hooks.json registers Stop with shell:bash dispatch"
fi

# 2. stop_hook_active short-circuits
output=$(printf '{"stop_hook_active": true, "cwd": "%s"}' "$TEST_ROOT" | bash "$HOOK_UNDER_TEST" 2>&1)
[[ -z "$output" ]] && pass "stop_hook_active: true allows normal exit" || fail "stop_hook_active: true allows normal exit (got: $output)"

# 3. Disabled via env
output=$(printf '{"stop_hook_active": false}' | env SUPERPOWERS_DISABLE_STOP_HOOK=1 bash "$HOOK_UNDER_TEST" 2>&1)
[[ -z "$output" ]] && pass "SUPERPOWERS_DISABLE_STOP_HOOK=1 allows normal exit" || fail "SUPERPOWERS_DISABLE_STOP_HOOK=1 allows normal exit (got: $output)"

# 4. Unregistered plan with incomplete tasks never blocks (no plan for this run)
unreg=$(make_repo unreg <<'PLAN'
# Feature Plan
- [ ] Step 1: Leftover step
PLAN
)
output=$(run_hook "$unreg" "Hello, mentions docs/superpowers/plans/feature.md")
[[ -z "$output" ]] && pass "Unregistered plan (even if mentioned) allows normal exit" || fail "Unregistered plan allows normal exit (got: $output)"

# 4b. Outside a git repository
mkdir -p "$TEST_ROOT/nogit"
output=$(run_hook "$TEST_ROOT/nogit" "Hello")
[[ -z "$output" ]] && pass "Non-git directory allows normal exit" || fail "Non-git directory allows normal exit (got: $output)"

# 5. Registered plan with incomplete tasks blocks with next step
incomplete=$(make_repo incomplete <<'PLAN'
# Feature Plan
- [x] Step 1: Completed step
- [ ] Step 2: Incomplete core step
PLAN
)
register "$incomplete"
if run_hook "$incomplete" "Finished step 1" | is_block "Step 2: Incomplete core step"; then
    pass "Registered plan with incomplete tasks blocks with next task preview"
else
    fail "Registered plan with incomplete tasks blocks with next task preview"
fi

# 6. Complete + final review allows exit and releases the marker
complete=$(make_repo complete <<'PLAN'
# Feature Plan
- [x] Step 1: Completed step
- [x] Final whole-branch review: clean
PLAN
)
register "$complete"
output=$(run_hook "$complete" "All done!")
if [[ -z "$output" ]] && [[ -z "$(ls "$complete/.superpowers/active-plans/"*.json 2>/dev/null)" ]]; then
    pass "Completed plan with final review allows exit and clears its marker"
else
    fail "Completed plan with final review allows exit and clears its marker (got: $output)"
fi

# 6b. Complete without final review blocks and points at branch-code-review
noreview=$(make_repo noreview <<'PLAN'
# Feature Plan
- [x] Step 1: Completed step
PLAN
)
register "$noreview"
if run_hook "$noreview" "All done!" | is_block "branch-code-review"; then
    pass "Completed plan without final review blocks and requests branch review"
else
    fail "Completed plan without final review blocks and requests branch review"
fi

# 7. Optional sections do not block
optional=$(make_repo optional <<'PLAN'
# Feature Plan
- [x] Step 1: Completed step
- [x] Final whole-branch review: clean

## Optional
- [ ] Optional Step: Nice to have extra
PLAN
)
register "$optional"
output=$(run_hook "$optional" "Core steps done")
[[ -z "$output" ]] && pass "Unchecked items under optional sections do not block exit" || fail "Optional sections (got: $output)"

# 8. EXIT_SIGNAL: false blocks even when tasks are complete
register "$complete"
if run_hook "$complete" $'---RALPH_STATUS---\nEXIT_SIGNAL: false\n---END_RALPH_STATUS---' | is_block; then
    pass "Explicit EXIT_SIGNAL: false blocks exit"
else
    fail "Explicit EXIT_SIGNAL: false blocks exit"
fi

# 9. STATUS: BLOCKED never traps the agent
output=$(run_hook "$incomplete" "STATUS: BLOCKED - need user input on API key")
[[ -z "$output" ]] && pass "STATUS: BLOCKED allows exit" || fail "STATUS: BLOCKED allows exit (got: $output)"

# 10. Circuit breaker trips and releases the marker
cb=$(make_repo cb <<'PLAN'
# Feature Plan
- [ ] Step 1: Stuck step
PLAN
)
register "$cb"
cb_tripped=false
for i in {1..6}; do
    output=$(run_hook "$cb" "Still trying...")
    if [[ "$output" =~ "Circuit breaker tripped" ]]; then cb_tripped=true; break; fi
done
if [[ "$cb_tripped" == "true" ]] && [[ -z "$(run_hook "$cb" "again")" ]]; then
    pass "Circuit breaker trips, then the plan stops gating"
else
    fail "Circuit breaker trips, then the plan stops gating"
fi

# 11. A marker owned by another session is ignored
other=$(make_repo other <<'PLAN'
# Feature Plan
- [ ] Step 1: Someone else's step
PLAN
)
register "$other" "s-other"
output=$(run_hook "$other" "Hello" "s1")
if [[ -z "$output" ]] && run_hook "$other" "Hello" "s-other" | is_block; then
    pass "Marker from another session is ignored; owner session is gated"
else
    fail "Marker from another session is ignored; owner session is gated (got: $output)"
fi

# 12. Worktree: plan executed in a worktree, session cwd is the main checkout
wt_main=$(make_repo wt_main <<'PLAN'
# Feature Plan
- [ ] Step 1: Do work
PLAN
)
git -C "$wt_main" worktree add -q "$wt_main/.worktrees/feat" -b feat
register "$wt_main/.worktrees/feat"
if run_hook "$wt_main" "Working" | is_block "Step 1: Do work"; then
    wt_block=true
else
    wt_block=false
fi
cat > "$wt_main/.worktrees/feat/docs/superpowers/plans/feature.md" <<'PLAN'
# Feature Plan
- [x] Step 1: Do work
- [x] Final whole-branch review: clean
PLAN
output=$(run_hook "$wt_main" "Done")
if [[ "$wt_block" == "true" ]] && [[ -z "$output" ]]; then
    pass "Worktree plan is gated from the main checkout and reads the worktree copy"
else
    fail "Worktree plan is gated from the main checkout and reads the worktree copy (got: $output)"
fi

# 13. run-hook.cmd dispatches stop-hook correctly
wrapper=$(make_repo wrapper <<'PLAN'
# Feature Plan
- [ ] Step 1: Step under wrapper
PLAN
)
register "$wrapper"
payload=$(node -e 'console.log(JSON.stringify({stop_hook_active: false, cwd: process.argv[1], session_id: "s1", last_assistant_message: "Trying..."}));' "$wrapper")
if printf '%s' "$payload" | bash "$WRAPPER_UNDER_TEST" stop-hook 2>&1 | is_block; then
    pass "run-hook.cmd wrapper dispatches stop-hook cleanly"
else
    fail "run-hook.cmd wrapper dispatches stop-hook cleanly"
fi

echo ""
if [[ "$FAILURES" -gt 0 ]]; then
    echo "STATUS: FAILED ($FAILURES failure(s))"
    exit 1
fi

echo "STATUS: PASSED"
