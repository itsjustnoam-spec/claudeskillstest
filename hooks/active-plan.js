#!/usr/bin/env node
/**
 * Active-plan markers: the single source of truth for "this session is
 * executing this plan". The Stop hook gates ONLY when a marker exists, so
 * runs without a plan, chats that merely mention a plan, and leftover plan
 * files never block exit.
 *
 * Markers live in the MAIN working tree (resolved via `git rev-parse
 * --git-common-dir`), so the main checkout and every linked worktree see the
 * same markers. Not under .git/ itself, because Claude Code denies agent
 * writes there.
 *
 *   <main-worktree>/.superpowers/active-plans/<id>.json
 *   { plan, worktree, session, createdAt, updatedAt, breaker }
 *
 * CLI (used by executing skills):
 *   node active-plan.js start PLAN_FILE   register the plan as active
 *   node active-plan.js done  PLAN_FILE   clear it (final review is clean)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

// A marker nobody touched for this long is abandoned and ignored.
const MARKER_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function git(cwd, args) {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch (err) {
    return null;
  }
}

/** Directory holding markers for the repository containing `cwd`, or null outside git. */
function markerDir(cwd) {
  const common = git(cwd, ['rev-parse', '--path-format=absolute', '--git-common-dir']);
  if (!common) return null;
  const commonAbs = path.resolve(cwd, common);
  // Non-bare repo: common dir is <main-worktree>/.git → markers go in the main worktree.
  const root = path.basename(commonAbs) === '.git' ? path.dirname(commonAbs) : commonAbs;
  return path.join(root, '.superpowers', 'active-plans');
}

function markerId(planAbs) {
  return crypto.createHash('sha1').update(planAbs.replace(/\\/g, '/').toLowerCase()).digest('hex').slice(0, 16);
}

function currentSession() {
  return process.env.CLAUDE_SESSION_ID || process.env.CLAUDE_CODE_SESSION_ID || '';
}

function readMarkers(dir) {
  if (!dir || !fs.existsSync(dir)) return [];
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.json')) continue;
    const file = path.join(dir, name);
    try {
      out.push({ file, data: JSON.parse(fs.readFileSync(file, 'utf8')) });
    } catch (err) {
      // Corrupt marker: ignore.
    }
  }
  return out;
}

function writeMarker(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const ignore = path.join(path.dirname(file), '.gitignore');
  if (!fs.existsSync(ignore)) fs.writeFileSync(ignore, '*\n');
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function removeMarker(file) {
  try {
    fs.unlinkSync(file);
  } catch (err) {}
}

/**
 * Find the marker belonging to `sessionId`. A marker registered without a
 * session (the executor's shell had no session id) is claimed by the first
 * session whose Stop hook sees it, so it never gates any other session.
 */
function findSessionMarker(cwd, sessionId) {
  const dir = markerDir(cwd);
  const now = Date.now();
  let unbound = null;
  for (const m of readMarkers(dir)) {
    if (now - (m.data.updatedAt || 0) > MARKER_MAX_AGE_MS) {
      removeMarker(m.file);
      continue;
    }
    if (!m.data.plan || !fs.existsSync(m.data.plan)) {
      removeMarker(m.file);
      continue;
    }
    if (m.data.session && m.data.session === sessionId) return m;
    if (!m.data.session && !unbound) unbound = m;
  }
  if (unbound && sessionId) {
    unbound.data.session = sessionId;
    writeMarker(unbound.file, unbound.data);
  }
  return unbound;
}

function start(planArg, cwd = process.cwd()) {
  const planAbs = path.resolve(cwd, planArg);
  if (!fs.existsSync(planAbs)) throw new Error(`no such plan file: ${planArg}`);
  const dir = markerDir(path.dirname(planAbs));
  if (!dir) throw new Error('not inside a git repository');
  const file = path.join(dir, `${markerId(planAbs)}.json`);
  const now = Date.now();
  let existing = {};
  try {
    existing = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {}
  writeMarker(file, {
    plan: planAbs,
    worktree: git(path.dirname(planAbs), ['rev-parse', '--show-toplevel']) || path.dirname(planAbs),
    session: currentSession() || existing.session || '',
    createdAt: existing.createdAt || now,
    updatedAt: now,
    breaker: existing.breaker || null
  });
  return file;
}

function done(planArg, cwd = process.cwd()) {
  const planAbs = path.resolve(cwd, planArg);
  const dir = markerDir(fs.existsSync(planAbs) ? path.dirname(planAbs) : cwd);
  if (!dir) return;
  removeMarker(path.join(dir, `${markerId(planAbs)}.json`));
}

if (require.main === module) {
  const [cmd, plan] = process.argv.slice(2);
  try {
    if (cmd === 'start' && plan) {
      console.log(`active plan registered: ${start(plan)}`);
    } else if (cmd === 'done' && plan) {
      done(plan);
      console.log('active plan cleared');
    } else {
      console.error('usage: active-plan.js start|done PLAN_FILE');
      process.exit(2);
    }
  } catch (err) {
    console.error(err.message);
    process.exit(2);
  }
}

module.exports = { markerDir, findSessionMarker, writeMarker, removeMarker, start, done };
