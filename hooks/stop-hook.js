#!/usr/bin/env node
/**
 * Stop hook for superpowers plugin: intelligent exit gate and continuous loop execution.
 * Inspired by Ralph Loop (https://github.com/frankbria/ralph-claude-code):
 * - Dual-condition exit gate (objective task completion + agent exit signal)
 * - Intercepts premature stops during active plan execution
 * - Circuit breaker protection against infinite loops
 * - Respects stop_hook_active and manual block/clarification escalations
 */

const fs = require('fs');
const path = require('path');

function normalizePath(p) {
  if (!p) return p;
  if (process.platform === 'win32') {
    const cygMatch = p.match(/^\/cygdrive\/([a-zA-Z])\/(.*)$/);
    if (cygMatch) {
      return `${cygMatch[1]}:/${cygMatch[2]}`;
    }
    const bashMatch = p.match(/^\/([a-zA-Z])\/(.*)$/);
    if (bashMatch) {
      return `${bashMatch[1]}:/${bashMatch[2]}`;
    }
  }
  return p;
}

function main() {
  // 1. Check if disabled via environment variable
  if (
    process.env.SUPERPOWERS_DISABLE_STOP_HOOK === '1' ||
    process.env.RALPH_DISABLE_STOP_HOOK === '1'
  ) {
    process.exit(0);
  }

  // 2. Read stdin JSON payload from Claude Code
  let input = '';
  try {
    input = fs.readFileSync(0, 'utf8');
  } catch (err) {
    process.exit(0);
  }

  if (!input || input.trim() === '') {
    process.exit(0);
  }

  let payload;
  try {
    payload = JSON.parse(input);
  } catch (err) {
    process.exit(0);
  }

  // 3. Safety guard: Recursion & loop breaker
  // If stop_hook_active is true, Claude Code is already continuing from a previous hook block.
  // Allow stop to prevent infinite loops.
  if (payload.stop_hook_active === true) {
    process.exit(0);
  }

  const lastMsg = payload.last_assistant_message || '';
  const rawCwd = payload.cwd || process.cwd();
  const cwd = normalizePath(rawCwd);

  // 4. Safety guard: Do not block if Claude is waiting for human partner ruling or escalations
  // The four non-negotiable stops: destructive ops, security-sensitive, out-of-worktree side effects, unrecoverable plan error.
  if (
    /STATUS:\s*BLOCKED/i.test(lastMsg) ||
    /\[BLOCKED\]/i.test(lastMsg) ||
    /Blocked:/i.test(lastMsg) ||
    /need(?:s)?\s+(?:your|human|partner)\s+(?:input|decision|approval|confirmation)/i.test(lastMsg)
  ) {
    process.exit(0);
  }

  // 5. Locate active plan
  const planInfo = findActivePlan(cwd, lastMsg);
  if (!planInfo || !planInfo.filePath || !fs.existsSync(planInfo.filePath)) {
    // No active plan found; allow normal exit
    process.exit(0);
  }

  const planPath = planInfo.filePath;
  const relativePlanPath = path.relative(cwd, planPath).replace(/\\/g, '/');

  // 6. Parse plan tasks and checkboxes
  const taskAnalysis = analyzePlanTasks(planPath);
  if (!taskAnalysis.hasTasks) {
    // The file has no task checkboxes; not an active checklist plan
    process.exit(0);
  }

  // 7. Check Claude's explicit exit signal in last message
  const exitSignal = extractExitSignal(lastMsg);

  // 8. Dual-Condition Exit Gate Evaluation
  // Case A: Claude explicitly emitted EXIT_SIGNAL: false (work in progress)
  if (exitSignal === false) {
    blockExit(cwd, planPath, relativePlanPath, taskAnalysis, "Agent reported 'EXIT_SIGNAL: false' (work in progress).");
    return;
  }

  // Case B: Incomplete non-optional tasks remain
  if (taskAnalysis.incompleteTasks.length > 0) {
    blockExit(
      cwd,
      planPath,
      relativePlanPath,
      taskAnalysis,
      `${taskAnalysis.incompleteTasks.length} non-optional task(s) remain incomplete in ${relativePlanPath}.`
    );
    return;
  }

  // Case C: All non-optional tasks are complete, but the final whole-branch
  // review has not been recorded in the plan. Block so the agent dispatches
  // the reviewer subagent before finishing. Plans found only via the
  // "most recent plan" fallback are skipped when stale, so finished
  // historical plans don't gate every stop.
  if (!taskAnalysis.finalReviewDone && !isStaleFallbackPlan(planInfo)) {
    blockExit(
      cwd,
      planPath,
      relativePlanPath,
      taskAnalysis,
      `All tasks in ${relativePlanPath} are complete, but no final whole-branch review is recorded. ` +
        `Use branch-code-review to dispatch a reviewer subagent over the full branch diff ` +
        `(git merge-base <base> HEAD..HEAD). Address Critical/Important findings, then append ` +
        `"- [x] Final whole-branch review: clean" to the plan.`
    );
    return;
  }

  // Case D: All non-optional tasks and the final review are complete!
  // Clear any existing circuit breaker state
  clearCircuitBreakerState(cwd);
  process.exit(0);
}

/**
 * Locate active plan file across standard locations
 */
function findActivePlan(cwd, lastMsg) {
  // 1. Explicit environment variable
  const envPlan = process.env.PLAN_FILE || process.env.RALPH_PLAN;
  if (envPlan) {
    const normEnv = normalizePath(envPlan);
    const resolved = path.isAbsolute(normEnv) ? normEnv : path.join(cwd, normEnv);
    if (fs.existsSync(resolved)) {
      return { filePath: resolved, source: 'env' };
    }
  }

  // 2. Mentioned in last assistant message
  const matchMention = lastMsg.match(/(?:docs\/superpowers\/plans\/|\.ralph\/)[a-zA-Z0-9_\-\./]+\.md/i);
  if (matchMention) {
    const mentionedPath = path.join(cwd, matchMention[0]);
    if (fs.existsSync(mentionedPath)) {
      return { filePath: mentionedPath, source: 'message' };
    }
  }

  // 3. Subagent-Driven Development (SDD) ledger under .superpowers/sdd/
  const sddDir = path.join(cwd, '.superpowers', 'sdd');
  if (fs.existsSync(sddDir)) {
    try {
      const entries = fs.readdirSync(sddDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const progressFile = path.join(sddDir, entry.name, 'progress.md');
          if (fs.existsSync(progressFile)) {
            const firstLine = fs.readFileSync(progressFile, 'utf8').split('\n')[0] || '';
            const ledgerMatch = firstLine.match(/# SDD ledger — plan:\s*(.+)$/i);
            if (ledgerMatch && ledgerMatch[1]) {
              const ledgerPlan = normalizePath(ledgerMatch[1].trim());
              const resolved = path.isAbsolute(ledgerPlan) ? ledgerPlan : path.join(cwd, ledgerPlan);
              if (fs.existsSync(resolved)) {
                return { filePath: resolved, source: 'sdd-ledger' };
              }
            }
          }
        }
      }
    } catch (err) {
      // Ignore directory read errors
    }
  }

  // 4. Ralph fix_plan.md (.ralph/fix_plan.md)
  const ralphPlan = path.join(cwd, '.ralph', 'fix_plan.md');
  if (fs.existsSync(ralphPlan)) {
    return { filePath: ralphPlan, source: 'ralph' };
  }

  // 5. Most recently modified plan in docs/superpowers/plans/
  const plansDir = path.join(cwd, 'docs', 'superpowers', 'plans');
  if (fs.existsSync(plansDir)) {
    try {
      const files = fs.readdirSync(plansDir)
        .filter(f => f.endsWith('.md'))
        .map(f => {
          const fullPath = path.join(plansDir, f);
          const stat = fs.statSync(fullPath);
          return { fullPath, mtime: stat.mtimeMs };
        })
        .sort((a, b) => b.mtime - a.mtime);

      if (files.length > 0) {
        return { filePath: files[0].fullPath, source: 'plans-dir' };
      }
    } catch (err) {
      // Ignore directory read errors
    }
  }

  return null;
}

/**
 * Parse a markdown plan and extract complete vs incomplete tasks,
 * excluding optional sections (Optional, Future, Future Enhancements, Nice to Have).
 */
function analyzePlanTasks(planPath) {
  let content = '';
  try {
    content = fs.readFileSync(planPath, 'utf8');
  } catch (err) {
    return { hasTasks: false, incompleteTasks: [], completedTasks: [], optionalTasks: [] };
  }

  const lines = content.split(/\r?\n/);
  const incompleteTasks = [];
  const completedTasks = [];
  const optionalTasks = [];

  let inOptionalSection = false;
  let optionalHeadingLevel = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check heading for optional sections
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const title = headingMatch[2].trim();

      if (/^(optional|future|future enhancements|nice to have)$/i.test(title)) {
        inOptionalSection = true;
        optionalHeadingLevel = level;
      } else if (inOptionalSection && level <= optionalHeadingLevel) {
        inOptionalSection = false;
      }
    }

    // Match checkboxes
    const incompleteMatch = line.match(/^\s*-\s*\[\s*\]\s+(.+)$/);
    if (incompleteMatch) {
      const taskItem = {
        line: i + 1,
        text: incompleteMatch[1].trim(),
        raw: line.trim()
      };
      if (inOptionalSection) {
        optionalTasks.push(taskItem);
      } else {
        incompleteTasks.push(taskItem);
      }
      continue;
    }

    const completedMatch = line.match(/^\s*-\s*\[[xX]\]\s+(.+)$/);
    if (completedMatch) {
      completedTasks.push({
        line: i + 1,
        text: completedMatch[1].trim(),
        raw: line.trim()
      });
    }
  }

  const totalTasks = incompleteTasks.length + completedTasks.length + optionalTasks.length;
  return {
    hasTasks: totalTasks > 0,
    incompleteTasks,
    completedTasks,
    optionalTasks,
    finalReviewDone: completedTasks.some(t => FINAL_REVIEW_PATTERN.test(t.text))
  };
}

// A checked task like "- [x] Final whole-branch review: clean" records that
// the end-of-plan re-review subagent ran.
const FINAL_REVIEW_PATTERN = /final\s+(?:whole[- ]branch\s+|code\s+)?review/i;

// Plans picked up only by the "most recent file in docs/superpowers/plans"
// fallback are treated as stale (not actively executing) once untouched for
// this long.
const STALE_FALLBACK_PLAN_MS = 60 * 60 * 1000;

function isStaleFallbackPlan(planInfo) {
  if (planInfo.source !== 'plans-dir') return false;
  try {
    return Date.now() - fs.statSync(planInfo.filePath).mtimeMs > STALE_FALLBACK_PLAN_MS;
  } catch (err) {
    return true;
  }
}

/**
 * Extract EXIT_SIGNAL from last assistant message
 */
function extractExitSignal(lastMsg) {
  if (!lastMsg) return null;

  // Match ---RALPH_STATUS--- or RALPH_STATUS: block or inline EXIT_SIGNAL
  const exitSigMatch = lastMsg.match(/EXIT_SIGNAL:\s*(true|false)/i);
  if (exitSigMatch) {
    return exitSigMatch[1].toLowerCase() === 'true';
  }

  if (/<promise>COMPLETE<\/promise>/i.test(lastMsg)) {
    return true;
  }

  return null;
}

/**
 * State path for circuit breaker
 */
function getStateFilePath(cwd) {
  const dir = path.join(cwd, '.superpowers');
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (err) {}
  }
  return path.join(dir, '.stop_hook_state.json');
}

function clearCircuitBreakerState(cwd) {
  const statePath = getStateFilePath(cwd);
  if (fs.existsSync(statePath)) {
    try {
      fs.unlinkSync(statePath);
    } catch (err) {}
  }
}

/**
 * Check circuit breaker and output decision: "block" if safe
 */
function blockExit(cwd, planPath, relativePlanPath, taskAnalysis, summaryReason) {
  const statePath = getStateFilePath(cwd);
  let state = {
    planFile: planPath,
    consecutiveBlocks: 0,
    lastIncompleteCount: taskAnalysis.incompleteTasks.length,
    lastCompletedCount: taskAnalysis.completedTasks.length
  };

  if (fs.existsSync(statePath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(statePath, 'utf8'));
      if (parsed.planFile === planPath) {
        state = parsed;
      }
    } catch (err) {}
  }

  // Check progress
  const madeProgress =
    taskAnalysis.completedTasks.length > (state.lastCompletedCount || 0) ||
    taskAnalysis.incompleteTasks.length < (state.lastIncompleteCount || Infinity);

  if (madeProgress) {
    state.consecutiveBlocks = 1;
  } else {
    state.consecutiveBlocks = (state.consecutiveBlocks || 0) + 1;
  }

  state.lastIncompleteCount = taskAnalysis.incompleteTasks.length;
  state.lastCompletedCount = taskAnalysis.completedTasks.length;
  state.updatedAt = Date.now();

  // Circuit breaker: Force exit after 5 consecutive blocks without progress
  const MAX_CONSECUTIVE_BLOCKS = 5;
  if (state.consecutiveBlocks >= MAX_CONSECUTIVE_BLOCKS) {
    console.error(
      `[stop-hook] Circuit breaker tripped: ${MAX_CONSECUTIVE_BLOCKS} consecutive blocks without task progress in ${relativePlanPath}. Allowing exit.`
    );
    clearCircuitBreakerState(cwd);
    process.exit(0);
  }

  // Save updated state
  try {
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf8');
  } catch (err) {}

  // Format next task preview
  const nextTask = taskAnalysis.incompleteTasks[0];
  const nextTaskPreview = nextTask ? `\n\nNext pending step:\n${nextTask.raw}` : '';

  const output = {
    decision: 'block',
    reason: `Autonomous plan execution in progress: ${summaryReason}${nextTaskPreview}\n\nPlease continue executing the plan without stopping until all tasks and tests pass cleanly.`
  };

  console.log(JSON.stringify(output, null, 2));
  process.exit(0);
}

if (require.main === module) {
  main();
}

module.exports = {
  normalizePath,
  findActivePlan,
  analyzePlanTasks,
  extractExitSignal
};
