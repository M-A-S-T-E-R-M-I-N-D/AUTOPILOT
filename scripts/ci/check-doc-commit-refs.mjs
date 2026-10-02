// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * check-doc-commit-refs — a doc that cites a commit SHA as evidence ("Done —
 * `abc1234` fixed the bug") is only as trustworthy as that SHA: this repo's
 * history has been rewritten enough times (reapply/revert cycles, squashes)
 * that dozens of narrative citations now point at commits unreachable from
 * HEAD — "pre-genesis" SHAs that look verifiable but silently aren't
 * (board web-mtndm581-4cimlx). This walks every tracked markdown file and
 * fails if a backtick-quoted commit-SHA citation doesn't resolve to a real
 * ancestor of HEAD.
 *
 * Detection is deliberately narrow (backtick-quoted hex only, 7-40 chars,
 * anchored at the start of the backtick span) to keep false positives near
 * zero — bare hex-looking words in prose routinely turn out to be URL
 * fragments or article IDs, not commit SHAs (e.g. a Medium slug ending in
 * `71923df63d01`), and are NOT flagged by this pattern.
 *
 * NEEDS FULL HISTORY: `git merge-base --is-ancestor` can only confirm a real
 * ancestor of HEAD if that ancestor was actually fetched, so this must run
 * against a `fetch-depth: 0` checkout (see the dedicated `doc-commit-refs`
 * job in .github/workflows/ci.yml, same shape as `commitlint`) — never
 * chained into the shallow-clone "verify" matrix, which would misfire on
 * every legitimately old citation.
 *
 * A git call that FAILS is not a verdict: only exit 1 means "not an
 * ancestor". Any other failure is retried, and one that keeps failing is
 * reported apart from the unreachable citations, with git's own error, so a
 * red run says which of the two it is (see `checkAncestry`). Both fail the
 * gate — an unchecked citation is not a verified one.
 *
 * LEGACY_ALLOWLIST carries files with pre-existing violations broader than
 * this task's named scope (docs/epics/*, docs/EVALUATION-*) — known debt,
 * not silently ignored; shrink this list as each file gets its own cleanup
 * pass. Do not add newly-authored files here.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const NUL = String.fromCharCode(0);

// A `git merge-base` call that fails runs up to MAX_ATTEMPTS times in all,
// pausing BASE_DELAY_MS, then twice that, between runs — enough to ride out a
// transient failure under fleet load without stalling the gate for long.
const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 1000;

const LEGACY_ALLOWLIST = new Set([
  'docs/EVALUATION-2026-08-20-sota.md',
  'docs/EVALUATION-2026-08-27-silent-gate.md',
  'docs/EVALUATION-2026-08-30-stranded-syncback.md',
  'docs/EVALUATION-2026-09-03-sync-conflict-taxonomy.md',
  'docs/epics/0002-shell-decomposition.md',
  'docs/epics/0004-bash-containment-worktree.md',
  'docs/epics/0006-github-connected-mode.md',
  'docs/epics/0007-platform-maintainer-and-pool.md',
  'docs/epics/0009-warm-sessions.md',
  'docs/epics/0015-cockpit-supervisory-control.md',
]);

// Backtick-quoted hex starting a code span: `` `abc1234` `` or
// `` `abc1234 fix(x): message` ``. The leading literal backtick anchors every
// match to the true start of a code span, so a longer hex run (a SHA-256
// content hash, a 64-char lockfile digest quoted in prose) can never match
// via an inner 40-char substring — backtracking has nowhere else to anchor
// from, since only the run's first character sits right after a backtick.
const SHA_CITATION_RE = /`([0-9a-f]{7,40})(?:`|\s)/g;

/**
 * Extract backtick-quoted commit-SHA-shaped citations from doc text. Pure —
 * no fs/git access — so it can be unit-tested directly against fixture
 * strings.
 * @param {string} text
 * @returns {{ line: number, sha: string }[]}
 */
export function findShaCitations(text) {
  /** @type {{ line: number, sha: string }[]} */
  const citations = [];
  const lines = text.split('\n');
  // Stryker disable next-line EqualityOperator: the `<=` bound runs one extra
  // iteration over `lines[lines.length]`, which the `?? ''` below turns into
  // an empty line SHA_CITATION_RE cannot match (it needs a backtick and seven
  // hex characters) — no citation, no observable change. Its sibling `>=`
  // mutant behaves exactly like the `if (false)` ConditionalExpression mutant
  // on this same line (zero iterations, no citations), which
  // check-doc-commit-refs.test.ts's positive fixtures DO kill, so nothing is
  // lost by disabling the operator. Same loop, same proof as secret-scan.mjs.
  for (let i = 0; i < lines.length; i++) {
    // Stryker disable next-line StringLiteral: the `''` fallback only exists
    // to satisfy noUncheckedIndexedAccess — every index the loop above reaches
    // is in bounds, so the fallback is never evaluated and no test can cover
    // a mutant sitting on it. The `??` -> `&&` LogicalOperator mutant on this
    // line stays live and IS killed (it blanks every line, so nothing matches).
    const line = lines[i] ?? '';
    for (const m of line.matchAll(SHA_CITATION_RE)) {
      citations.push({ line: i + 1, sha: m[1] });
    }
  }
  return citations;
}

/**
 * One `git merge-base --is-ancestor` run, as spawnSync reports it.
 * @typedef {{ status: number | null, signal: string | null, stderr: string, spawnError: string | null }} GitRun
 */

/**
 * A failed git run in one line: why it failed, plus whatever git printed.
 * @param {GitRun} run
 * @returns {string}
 */
export function describeGitFailure({ status, signal, stderr, spawnError }) {
  if (spawnError) return `git did not start: ${spawnError}`;
  const how = signal ? `killed by ${signal}` : `exit ${status}`;
  const said = stderr.trim();
  return said ? `${how}: ${said}` : how;
}

/**
 * Ask git whether `sha` is an ancestor of HEAD. `git merge-base --is-ancestor`
 * answers with exit 0 (yes) or exit 1 (no); anything else — exit 128, a
 * signal, a git that never started — means the call itself failed and says
 * nothing about history. A failed call is retried with a growing pause, and
 * one that keeps failing comes back as `failed` with git's last error, never
 * as `unreachable`: under five-lane load a transient failure once read as a
 * bad citation and got a correct landing reverted (dd079e5e). Pure apart from
 * the injected `runOnce` / `sleep` / `warn`, so it is unit-tested directly.
 * @param {string} sha
 * @param {{
 *   runOnce: (sha: string) => GitRun,
 *   sleep: (ms: number) => void,
 *   warn?: (line: string) => void,
 *   maxAttempts?: number,
 *   baseDelayMs?: number,
 * }} deps
 * @returns {{ verdict: 'reachable' | 'unreachable' } | { verdict: 'failed', attempts: number, detail: string }}
 */
export function checkAncestry(
  sha,
  { runOnce, sleep, warn = console.warn, maxAttempts = MAX_ATTEMPTS, baseDelayMs = BASE_DELAY_MS },
) {
  for (let attempt = 1; ; attempt++) {
    const run = runOnce(sha);
    if (run.status === 0) return { verdict: 'reachable' };
    if (run.status === 1) return { verdict: 'unreachable' };
    const detail = describeGitFailure(run);
    if (attempt >= maxAttempts) return { verdict: 'failed', attempts: attempt, detail };
    const delay = baseDelayMs * attempt;
    warn(
      `check-doc-commit-refs: git could not check \`${sha}\` (${detail}); ` +
        `retrying in ${delay}ms (attempt ${attempt}/${maxAttempts})`,
    );
    sleep(delay);
  }
}

// Stryker disable all: everything from here to the end of the file is the
// gate's process shell — `listTrackedMarkdown` shells out to `git ls-files`,
// `runMergeBase` to `git merge-base`, `sleepSync` blocks the thread, and
// `main` reads every tracked doc from disk and calls `process.exit` — so it
// can only be exercised by running the gate for real. The logic it delegates
// to, `findShaCitations` and `checkAncestry`, IS mutation-tested
// (config/mutation/stryker.ci-check-doc-commit-refs.config.mjs).
// (The `isMain` entry line at the bottom of the file is covered by this same
// directive: a mutant on it could only fire `main()` during a test import.)
/** @returns {string[]} */
function listTrackedMarkdown() {
  const out = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z', '--', '*.md'],
    { windowsHide: true, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  return out.split(NUL).filter(Boolean);
}

/** @param {string} sha @returns {GitRun} */
function runMergeBase(sha) {
  const r = spawnSync('git', ['merge-base', '--is-ancestor', sha, 'HEAD'], {
    windowsHide: true,
    encoding: 'utf8',
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  return {
    status: r.status,
    signal: r.signal,
    stderr: r.stderr ?? '',
    spawnError: r.error ? r.error.message : null,
  };
}

/** @param {number} ms */
function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function main() {
  const files = listTrackedMarkdown().filter((f) => !LEGACY_ALLOWLIST.has(f));
  /** @type {string[]} */
  const unreachable = [];
  /** @type {string[]} */
  const unchecked = [];
  /** @type {Map<string, ReturnType<typeof checkAncestry>>} */
  const cache = new Map();

  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    for (const { line, sha } of findShaCitations(text)) {
      let result = cache.get(sha);
      if (result === undefined) {
        result = checkAncestry(sha, { runOnce: runMergeBase, sleep: sleepSync });
        cache.set(sha, result);
      }
      if (result.verdict === 'unreachable') {
        unreachable.push(`${file}:${line}: commit \`${sha}\` is not reachable from HEAD`);
      } else if (result.verdict === 'failed') {
        unchecked.push(
          `${file}:${line}: commit \`${sha}\` could not be checked — git failed ` +
            `${result.attempts} time(s), last: ${result.detail}`,
        );
      }
    }
  }

  if (unreachable.length > 0) {
    console.error(`check-doc-commit-refs FAILED: ${unreachable.length} unreachable citation(s):`);
    for (const e of unreachable) console.error(`  - ${e}`);
  }
  if (unchecked.length > 0) {
    console.error(
      `check-doc-commit-refs FAILED: git could not check ${unchecked.length} citation(s) — ` +
        `not a verdict on the doc; read git's error, then rerun:`,
    );
    for (const e of unchecked) console.error(`  - ${e}`);
  }
  if (unreachable.length > 0 || unchecked.length > 0) process.exit(1);

  console.log(
    `check-doc-commit-refs OK: ${files.length} doc(s) checked (${LEGACY_ALLOWLIST.size} legacy file(s) skipped)`,
  );
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();
