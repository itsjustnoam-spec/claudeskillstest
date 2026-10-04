#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
HOOK_UNDER_TEST="$REPO_ROOT/hooks/stop-hook"
WRAPPER_UNDER_TEST="$REPO_ROOT/hooks/run-hook.cmd"

FAILURES=0
TEST_ROOT="$(mktemp -d)"

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

make_project() {
    local name="$1"
    local proj="$TEST_ROOT/$name"
    mkdir -p "$proj"
    printf '%s\n' "$proj"
}

echo "=== Stop Hook Tests ==="

# 1. Registration shape in hooks.json
if node -e '
const hooks = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
const entry = hooks.hooks.Stop[0].hooks[0];
if (entry.shell !== "bash") {
  console.error(`Stop hook shell is ${JSON.stringify(entry.shell)}, expected "bash"`);
  process.exit(1);
}
if (!/run-hook\.cmd" stop-hook$/.test(entry.command)) {
  console.error(`unexpected Stop command shape: ${entry.command}`);
  process.exit(1);
}
' "$REPO_ROOT/hooks/hooks.json"; then
    pass "hooks.json registers Stop with shell:bash dispatch"
else
    fail "hooks.json registers Stop with shell:bash dispatch"
fi

# 2. When stop_hook_active is true, allow exit immediately (loop breaker)
active_payload='{"stop_hook_active": true, "cwd": "'"$TEST_ROOT"'", "last_assistant_message": "Working..."}'
output=$(printf '%s' "$active_payload" | bash "$HOOK_UNDER_TEST" 2>&1)
if [[ -z "$output" ]]; then
    pass "stop_hook_active: true allows normal exit (empty output)"
else
    fail "stop_hook_active: true allows normal exit (got output: $output)"
fi

# 3. When disabled via environment variable, allow exit
output=$(printf '{"stop_hook_active": false}' | env SUPERPOWERS_DISABLE_STOP_HOOK=1 bash "$HOOK_UNDER_TEST" 2>&1)
if [[ -z "$output" ]]; then
    pass "SUPERPOWERS_DISABLE_STOP_HOOK=1 allows normal exit"
else
    fail "SUPERPOWERS_DISABLE_STOP_HOOK=1 allows normal exit (got output: $output)"
fi

# 4. When no active plan exists in the project, allow exit
empty_proj="$(make_project empty_proj)"
payload=$(node -e 'console.log(JSON.stringify({stop_hook_active: false, cwd: process.argv[1], last_assistant_message: "Hello"}));' "$empty_proj")
output=$(printf '%s' "$payload" | bash "$HOOK_UNDER_TEST" 2>&1)
if [[ -z "$output" ]]; then
    pass "No active plan in directory allows normal exit"
else
    fail "No active plan in directory allows normal exit (got output: $output)"
fi

# 5. Plan with incomplete tasks blocks exit and specifies next task
incomplete_proj="$(make_project incomplete_proj)"
mkdir -p "$incomplete_proj/docs/superpowers/plans"
cat << 'PLAN' > "$incomplete_proj/docs/superpowers/plans/feature.md"
# Feature Plan
- [x] Step 1: Completed step
- [ ] Step 2: Incomplete core step
- [ ] Step 3: Another step
PLAN

payload=$(node -e 'console.log(JSON.stringify({stop_hook_active: false, cwd: process.argv[1], last_assistant_message: "Finished step 1"}));' "$incomplete_proj")
output=$(printf '%s' "$payload" | bash "$HOOK_UNDER_TEST" 2>&1)

if printf '%s' "$output" | node -e '
const fs = require("fs");
const data = JSON.parse(fs.readFileSync(0, "utf8"));
if (data.decision !== "block") {
  console.error("Expected decision: block, got: " + data.decision);
  process.exit(1);
}
if (!data.reason.includes("Step 2: Incomplete core step")) {
  console.error("Reason did not include next step: " + data.reason);
  process.exit(1);
}
'; then
    pass "Incomplete tasks in plan trigger decision: block with next task preview"
else
    fail "Incomplete tasks in plan trigger decision: block with next task preview"
fi

# 6. Plan with all non-optional tasks and final review completed allows exit
complete_proj="$(make_project complete_proj)"
mkdir -p "$complete_proj/docs/superpowers/plans"
cat << 'PLAN' > "$complete_proj/docs/superpowers/plans/feature.md"
# Feature Plan
- [x] Step 1: Completed step
- [x] Step 2: Another completed step
- [x] Final whole-branch review: clean
PLAN

payload=$(node -e 'console.log(JSON.stringify({stop_hook_active: false, cwd: process.argv[1], last_assistant_message: "All done!"}));' "$complete_proj")
output=$(printf '%s' "$payload" | bash "$HOOK_UNDER_TEST" 2>&1)

if [[ -z "$output" ]]; then
    pass "All completed tasks plus final review allow normal exit"
else
    fail "All completed tasks plus final review allow normal exit (got output: $output)"
fi

# 6b. All tasks complete but no final review recorded blocks exit
noreview_proj="$(make_project noreview_proj)"
mkdir -p "$noreview_proj/docs/superpowers/plans"
cat << 'PLAN' > "$noreview_proj/docs/superpowers/plans/feature.md"
# Feature Plan
- [x] Step 1: Completed step
- [x] Step 2: Another completed step
PLAN

payload=$(node -e 'console.log(JSON.stringify({stop_hook_active: false, cwd: process.argv[1], last_assistant_message: "All done!"}));' "$noreview_proj")
output=$(printf '%s' "$payload" | bash "$HOOK_UNDER_TEST" 2>&1)

if printf '%s' "$output" | node -e '
const fs = require("fs");
const data = JSON.parse(fs.readFileSync(0, "utf8"));
if (data.decision !== "block") {
  console.error("Expected decision: block, got: " + data.decision);
  process.exit(1);
}
if (!data.reason.includes("branch-code-review")) {
  console.error("Reason did not point at branch-code-review: " + data.reason);
  process.exit(1);
}
'; then
    pass "Completed plan without final review blocks exit and requests branch review"
else
    fail "Completed plan without final review blocks exit and requests branch review"
fi

# 6c. Stale fallback plan without final review does not block exit
stale_proj="$(make_project stale_proj)"
mkdir -p "$stale_proj/docs/superpowers/plans"
cat << 'PLAN' > "$stale_proj/docs/superpowers/plans/old.md"
# Old Plan
- [x] Step 1: Completed long ago
PLAN
touch -d '2 hours ago' "$stale_proj/docs/superpowers/plans/old.md"

payload=$(node -e 'console.log(JSON.stringify({stop_hook_active: false, cwd: process.argv[1], last_assistant_message: "Hello"}));' "$stale_proj")
output=$(printf '%s' "$payload" | bash "$HOOK_UNDER_TEST" 2>&1)

if [[ -z "$output" ]]; then
    pass "Stale fallback plan without final review allows normal exit"
else
    fail "Stale fallback plan without final review allows normal exit (got output: $output)"
fi

# 7. Unchecked tasks under optional sections do not block exit
optional_proj="$(make_project optional_proj)"
mkdir -p "$optional_proj/docs/superpowers/plans"
cat << 'PLAN' > "$optional_proj/docs/superpowers/plans/feature.md"
# Feature Plan
- [x] Step 1: Completed step
- [x] Step 2: Another completed step
- [x] Final whole-branch review: clean

## Optional
- [ ] Optional Step: Nice to have extra

## Future Enhancements
- [ ] Future Step: Post-MVP idea
PLAN

payload=$(node -e 'console.log(JSON.stringify({stop_hook_active: false, cwd: process.argv[1], last_assistant_message: "Core steps done"}));' "$optional_proj")
output=$(printf '%s' "$payload" | bash "$HOOK_UNDER_TEST" 2>&1)

if [[ -z "$output" ]]; then
    pass "Unchecked items under optional/future sections do not block exit"
else
    fail "Unchecked items under optional/future sections do not block exit (got output: $output)"
fi

# 8. Explicit EXIT_SIGNAL: false blocks exit even if tasks are marked complete
payload=$(node -e 'console.log(JSON.stringify({stop_hook_active: false, cwd: process.argv[1], last_assistant_message: "---RALPH_STATUS---\nEXIT_SIGNAL: false\n---END_RALPH_STATUS---"}));' "$complete_proj")
output=$(printf '%s' "$payload" | bash "$HOOK_UNDER_TEST" 2>&1)

if printf '%s' "$output" | node -e '
const fs = require("fs");
const data = JSON.parse(fs.readFileSync(0, "utf8"));
if (data.decision !== "block") {
  console.error("Expected decision: block for EXIT_SIGNAL: false, got: " + data.decision);
  process.exit(1);
}
'; then
    pass "Explicit EXIT_SIGNAL: false blocks exit"
else
    fail "Explicit EXIT_SIGNAL: false blocks exit"
fi

# 9. STATUS: BLOCKED allows exit (does not trap blocked agent)
payload=$(node -e 'console.log(JSON.stringify({stop_hook_active: false, cwd: process.argv[1], last_assistant_message: "STATUS: BLOCKED - need user input on API key"}));' "$incomplete_proj")
output=$(printf '%s' "$payload" | bash "$HOOK_UNDER_TEST" 2>&1)

if [[ -z "$output" ]]; then
    pass "STATUS: BLOCKED allows exit without trapping agent"
else
    fail "STATUS: BLOCKED allows exit without trapping agent (got output: $output)"
fi

# 10. Circuit breaker trips after 5 consecutive blocks without task progress
cb_proj="$(make_project cb_proj)"
mkdir -p "$cb_proj/docs/superpowers/plans"
cat << 'PLAN' > "$cb_proj/docs/superpowers/plans/feature.md"
# Feature Plan
- [ ] Step 1: Stuck step
PLAN

payload=$(node -e 'console.log(JSON.stringify({stop_hook_active: false, cwd: process.argv[1], last_assistant_message: "Still trying..."}));' "$cb_proj")

cb_tripped=false
for i in {1..6}; do
    output=$(printf '%s' "$payload" | bash "$HOOK_UNDER_TEST" 2>&1)
    if [[ "$output" =~ "Circuit breaker tripped" ]]; then
        cb_tripped=true
        break
    fi
done

if [[ "$cb_tripped" == "true" ]]; then
    pass "Circuit breaker trips after repeated consecutive blocks without progress"
else
    fail "Circuit breaker trips after repeated consecutive blocks without progress"
fi

# 11. run-hook.cmd dispatches stop-hook correctly
wrapper_proj="$(make_project wrapper_proj)"
mkdir -p "$wrapper_proj/docs/superpowers/plans"
cat << 'PLAN' > "$wrapper_proj/docs/superpowers/plans/feature.md"
# Feature Plan
- [ ] Step 1: Step under wrapper
PLAN

payload=$(node -e 'console.log(JSON.stringify({stop_hook_active: false, cwd: process.argv[1], last_assistant_message: "Trying..."}));' "$wrapper_proj")
output=$(printf '%s' "$payload" | bash "$WRAPPER_UNDER_TEST" stop-hook 2>&1)

if printf '%s' "$output" | node -e '
const fs = require("fs");
const data = JSON.parse(fs.readFileSync(0, "utf8"));
if (data.decision !== "block") {
  console.error("Expected decision: block via wrapper, got: " + data.decision);
  process.exit(1);
}
'; then
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
