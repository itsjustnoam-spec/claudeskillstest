#!/usr/bin/env node
/**
 * Stop hook for superpowers plugin: intelligent exit gate and continuous loop execution.
 * Inspired by Ralph Loop (https://github.com/frankbria/ralph-claude-code):
 * - Dual-condition exit gate (objective task completion + agent exit signal)
 * - Intercepts premature stops during active plan execution
 * - Circuit breaker protection against infinite loops
 * - Respects stop_hook_active and manual block/clarification escalations
 *
 * Gating is opt-in: the hook only acts when THIS session registered a plan
 * via an active-plan marker (see active-plan.js) or PLAN_FILE is set. It never
 * guesses from plan files lying around, so runs without a plan and git
 * worktrees behave correctly.
 */

const fs = require('fs');
const path = require('path');
const activePlan = require('./active-plan');

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

  // 5. Locate this session's active plan (opt-in only)
  const planInfo = findActivePlan(cwd, payload.session_id || '');
  if (!planInfo) {
    process.exit(0);
  }

  const planPath = planInfo.filePath;
  const relativePlanPath = path.relative(cwd, planPath).replace(/\\/g, '/');

  // 6. Parse plan tasks and checkboxes
  const taskAnalysis = analyzePlanTasks(planPath);
  if (!taskAnalysis.hasTasks) {
    process.exit(0);
  }

  // 7. Check Claude's explicit exit signal in last message
  const exitSignal = extractExitSignal(lastMsg);

  // 8. Dual-Condition Exit Gate Evaluation
  // Case A: Claude explicitly emitted EXIT_SIGNAL: false (work in progress)
  if (exitSignal === false) {
    blockExit(planInfo, relativePlanPath, taskAnalysis, "Agent reported 'EXIT_SIGNAL: false' (work in progress).");
    return;
  }

  // Case B: Incomplete non-optional tasks remain
  if (taskAnalysis.incompleteTasks.length > 0) {
    blockExit(
      planInfo,
      relativePlanPath,
      taskAnalysis,
      `${taskAnalysis.incompleteTasks.length} non-optional task(s) remain incomplete in ${relativePlanPath}.`
    );
    return;
  }

  // Case C: All non-optional tasks are complete, but the final whole-branch
  // review has not been recorded in the plan.
  if (!taskAnalysis.finalReviewDone) {
    blockExit(
      planInfo,
      relativePlanPath,
      taskAnalysis,
      `All tasks in ${relativePlanPath} are complete, but no final whole-branch review is recorded. ` +
        `Use branch-code-review to dispatch a reviewer subagent over the full branch diff ` +
        `(git merge-base <base> HEAD..HEAD). Address Critical/Important findings, then append ` +
        `"- [x] Final whole-branch review: clean" to the plan.`
    );
    return;
  }

  // Case D: All non-optional tasks and the final review are complete — release the plan.
  releasePlan(planInfo);
  process.exit(0);
}

/**
 * The plan this session is executing, or null. Sources, in order:
 * 1. PLAN_FILE / RALPH_PLAN environment variable (manual override)
 * 2. An active-plan marker owned by (or claimable by) this session
 */
function findActivePlan(cwd, sessionId) {
  const envPlan = process.env.PLAN_FILE || process.env.RALPH_PLAN;
  if (envPlan) {
    const normEnv = normalizePath(envPlan);
    const resolved = path.isAbsolute(normEnv) ? normEnv : path.join(cwd, normEnv);
    if (fs.existsSync(resolved)) {
      return { filePath: resolved, source: 'env', breaker: null };
    }
  }

  const marker = activePlan.findSessionMarker(cwd, sessionId);
  if (marker) {
    return { filePath: marker.data.plan, source: 'marker', marker, breaker: marker.data.breaker || null };
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

/**
 * Extract EXIT_SIGNAL from last assistant message
 */
function extractExitSignal(lastMsg) {
  if (!lastMsg) return null;

  const exitSigMatch = lastMsg.match(/EXIT_SIGNAL:\s*(true|false)/i);
  if (exitSigMatch) {
    return exitSigMatch[1].toLowerCase() === 'true';
  }

  if (/<promise>COMPLETE<\/promise>/i.test(lastMsg)) {
    return true;
  }

  return null;
}

/** Stop gating this plan: delete its marker (env-provided plans have none). */
function releasePlan(planInfo) {
  if (planInfo.marker) activePlan.removeMarker(planInfo.marker.file);
}

/** Persist circuit-breaker state inside the session's marker. */
function saveBreaker(planInfo, breaker) {
  if (!planInfo.marker) return;
  planInfo.marker.data.breaker = breaker;
  planInfo.marker.data.updatedAt = Date.now();
  try {
    activePlan.writeMarker(planInfo.marker.file, planInfo.marker.data);
  } catch (err) {}
}

/**
 * Check circuit breaker and output decision: "block" if safe
 */
function blockExit(planInfo, relativePlanPath, taskAnalysis, summaryReason) {
  const prev = planInfo.breaker || {};
  const madeProgress =
    taskAnalysis.completedTasks.length > (prev.lastCompletedCount || 0) ||
    taskAnalysis.incompleteTasks.length < (prev.lastIncompleteCount ?? Infinity);

  const breaker = {
    consecutiveBlocks: madeProgress ? 1 : (prev.consecutiveBlocks || 0) + 1,
    lastIncompleteCount: taskAnalysis.incompleteTasks.length,
    lastCompletedCount: taskAnalysis.completedTasks.length
  };

  // Circuit breaker: Force exit after 5 consecutive blocks without progress
  const MAX_CONSECUTIVE_BLOCKS = 5;
  if (breaker.consecutiveBlocks >= MAX_CONSECUTIVE_BLOCKS) {
    console.error(
      `[stop-hook] Circuit breaker tripped: ${MAX_CONSECUTIVE_BLOCKS} consecutive blocks without task progress in ${relativePlanPath}. Allowing exit.`
    );
    releasePlan(planInfo);
    process.exit(0);
  }

  saveBreaker(planInfo, breaker);

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
