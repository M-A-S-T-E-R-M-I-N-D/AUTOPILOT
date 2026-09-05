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
 * LEGACY_ALLOWLIST carries files with pre-existing violations broader than
 * this task's named scope (docs/epics/*, docs/EVALUATION-*) — known debt,
 * not silently ignored; shrink this list as each file gets its own cleanup
 * pass. Do not add newly-authored files here.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const NUL = String.fromCharCode(0);

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
// `` `abc1234 fix(x): message` ``. Word-boundaried so it never matches a
// SHA embedded mid-token.
const SHA_CITATION_RE = /`([0-9a-f]{7,40})(?:`|\s)/g;

/** @returns {string[]} */
function listTrackedMarkdown() {
  const out = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z', '--', '*.md'],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  return out.split(NUL).filter(Boolean);
}

/** @param {string} sha @returns {boolean} */
function isReachableFromHead(sha) {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', sha, 'HEAD'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function main() {
  const files = listTrackedMarkdown().filter((f) => !LEGACY_ALLOWLIST.has(f));
  /** @type {string[]} */
  const errors = [];
  /** @type {Map<string, boolean>} */
  const cache = new Map();

  for (const file of files) {
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      for (const m of line.matchAll(SHA_CITATION_RE)) {
        const sha = m[1];
        let reachable = cache.get(sha);
        if (reachable === undefined) {
          reachable = isReachableFromHead(sha);
          cache.set(sha, reachable);
        }
        if (!reachable) {
          errors.push(`${file}:${i + 1}: commit \`${sha}\` is not reachable from HEAD`);
        }
      }
    });
  }

  if (errors.length > 0) {
    console.error(`check-doc-commit-refs FAILED: ${errors.length} unreachable citation(s):`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }

  console.log(
    `check-doc-commit-refs OK: ${files.length} doc(s) checked (${LEGACY_ALLOWLIST.size} legacy file(s) skipped)`,
  );
}

main();
