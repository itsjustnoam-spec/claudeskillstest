#!/usr/bin/env node
/**
 * Extract candidate manual corrections from Claude Code session transcripts.
 *
 * Transcripts live at <CLAUDE_CONFIG_DIR or ~/.claude>/projects/<encoded-cwd>/<session>.jsonl.
 * Every human-typed user message is paired with the assistant text that
 * preceded it, so the analyzer can see what was being corrected. Only
 * messages that look like corrections are kept unless --all is passed;
 * the heuristic is deliberately loose — the analyzer judges each one.
 *
 * Usage:
 *   node extract-corrections.js [--project <path>] [--since YYYY-MM-DD] [--all] [--out <file>]
 *
 * Writes markdown to --out (default: ./.superpowers/review-analysis/corrections.md)
 * and prints a one-line summary.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const CORRECTION_PATTERN = new RegExp(
  [
    "^no\\b", "\\bdon'?t\\b", "\\bdo not\\b", "\\bnever\\b", "\\bstop\\b", "\\bwrong\\b",
    "\\binstead\\b", "\\bactually\\b", "\\bwhy did you\\b", "\\byou (forgot|missed|didn'?t|should|shouldn'?t)\\b",
    "\\bI (said|told you|asked)\\b", "\\bagain\\b", "\\brevert\\b", "\\bundo\\b", "\\bnot what\\b",
    "\\bshouldn'?t\\b", "\\bremove (it|this|that)\\b", "\\bplease (use|don'?t|remove|fix|keep)\\b"
  ].join('|'),
  'i'
);

const SKIP_PREFIXES = ['<command-', '<local-command', 'Caveat:', '[Request interrupted', '<system-reminder>'];
const ASSISTANT_SNIPPET = 400;
const USER_SNIPPET = 1500;

function parseArgs(argv) {
  const args = { all: false, project: null, since: null, out: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--all') args.all = true;
    else if (a === '--project') args.project = argv[++i];
    else if (a === '--since') args.since = argv[++i];
    else if (a === '--out') args.out = argv[++i];
    else {
      console.error(`unknown argument: ${a}`);
      process.exit(2);
    }
  }
  return args;
}

function projectsRoot() {
  const base = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
  return path.join(base, 'projects');
}

// Claude Code encodes the session cwd by replacing every non-alphanumeric
// character with '-'.
function encodeProject(p) {
  return path.resolve(p).replace(/[^a-zA-Z0-9]/g, '-');
}

function textOf(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .filter(block => block && block.type === 'text' && typeof block.text === 'string')
    .map(block => block.text)
    .join('\n');
}

function truncate(s, n) {
  const flat = s.replace(/\s+/g, ' ').trim();
  return flat.length > n ? `${flat.slice(0, n)}…` : flat;
}

function extractFromFile(file, args) {
  const results = [];
  let lastAssistant = '';
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim()) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch (err) {
      continue;
    }
    if (entry.isSidechain || entry.isMeta || !entry.message) continue;

    if (entry.type === 'assistant') {
      const text = textOf(entry.message.content);
      if (text.trim()) lastAssistant = text;
      continue;
    }
    if (entry.type !== 'user') continue;

    const text = textOf(entry.message.content).trim();
    if (!text || SKIP_PREFIXES.some(p => text.startsWith(p))) continue;
    if (args.since && entry.timestamp && entry.timestamp.slice(0, 10) < args.since) continue;
    if (!args.all && !CORRECTION_PATTERN.test(text)) continue;

    results.push({
      timestamp: entry.timestamp || 'unknown',
      session: entry.sessionId || path.basename(file, '.jsonl'),
      cwd: entry.cwd || path.basename(path.dirname(file)),
      before: truncate(lastAssistant, ASSISTANT_SNIPPET),
      text: truncate(text, USER_SNIPPET)
    });
  }
  return results;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = projectsRoot();
  if (!fs.existsSync(root)) {
    console.error(`no Claude Code transcripts found at ${root}`);
    process.exit(1);
  }

  const dirs = args.project
    ? [path.join(root, encodeProject(args.project))]
    : fs.readdirSync(root).map(d => path.join(root, d));

  const items = [];
  for (const dir of dirs) {
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) continue;
    for (const f of fs.readdirSync(dir)) {
      if (f.endsWith('.jsonl')) items.push(...extractFromFile(path.join(dir, f), args));
    }
  }
  items.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  const out = args.out || path.join(process.cwd(), '.superpowers', 'review-analysis', 'corrections.md');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const body = items
    .map((it, i) =>
      [
        `## C${i + 1} — ${it.timestamp} — session ${it.session}`,
        `- **Project:** ${it.cwd}`,
        `- **Claude before:** ${it.before || '(none)'}`,
        `- **User said:** ${it.text}`
      ].join('\n')
    )
    .join('\n\n');
  fs.writeFileSync(out, `# Candidate manual corrections (${items.length})\n\n${body}\n`, 'utf8');
  console.log(`wrote ${out}: ${items.length} candidate correction(s) from ${dirs.length} project dir(s)`);
}

if (require.main === module) {
  main();
}

module.exports = { CORRECTION_PATTERN, encodeProject, textOf, extractFromFile };
