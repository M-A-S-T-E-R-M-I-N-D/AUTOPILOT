// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * secret-scan-history — pre-push gate that scans every commit about to be
 * pushed, not just the final tree state.
 *
 * scripts/ci/secret-scan.mjs only sees currently-tracked file content, so a
 * secret added in one commit and removed in a later one is invisible to it —
 * but GitHub push protection scans every commit in the push and blocks it
 * regardless, discovered only after the push leaves the machine, when the
 * fix needs a history rewrite this project's additive-only git policy
 * forbids without a human decision. Catching it here, against exactly the
 * commit range about to be pushed, avoids that trap.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findSecrets, EXCLUDED_FILES, BINARY_EXT } from './secret-scan.mjs';

const ZERO_SHA = /^0+$/;
const GIT_OPTS = { windowsHide: true, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 };

/**
 * @typedef {{ file: string, line: number, text: string }} AddedLine
 * @typedef {{ file: string, line: number, rule: string, match: string }} PatchFinding
 */

/**
 * Parse a unified diff (as produced by `git diff-tree -p`) into the lines it
 * adds, each tagged with the file and the line it lands on in the new
 * version of that file. Everything between a `diff --git` header and the
 * first `@@` hunk for that file is diff metadata (---/+++/index/mode/Binary
 * files ... differ) and is skipped wholesale, rather than pattern-matched
 * line by line — an added line whose own content happens to start with
 * `+++ b/` or `--- a/` would otherwise be misparsed as a header. Pure — no
 * git access — so it's directly unit-testable.
 * @param {string} patchText
 * @returns {AddedLine[]}
 */
export function parseAddedLines(patchText) {
  /** @type {AddedLine[]} */
  const added = [];
  let file = '';
  let newLine = 0;
  let inPreamble = false;

  for (const raw of patchText.split('\n')) {
    const fileHeader = /^diff --git a\/.+ b\/(.+)$/.exec(raw);
    if (fileHeader) {
      file = fileHeader[1] ?? '';
      newLine = 0;
      inPreamble = true;
      continue;
    }

    const hunkHeader = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw);
    if (hunkHeader) {
      newLine = Number(hunkHeader[1]);
      inPreamble = false;
      continue;
    }

    if (inPreamble) continue;

    if (raw.startsWith('+')) {
      added.push({ file, line: newLine, text: raw.slice(1) });
      newLine += 1;
    } else if (raw.startsWith(' ')) {
      newLine += 1;
    }
    // '-' (removed) and '\ No newline at end of file' don't advance newLine.
  }

  return added;
}

/**
 * Scan one commit's patch text for credential patterns, honoring the same
 * exclusions as secret-scan.mjs. Only additions are scanned: a secret's
 * introducing commit always carries it as a '+' line somewhere in the
 * pushed range, so removed lines add no coverage.
 * @param {string} patchText
 * @returns {PatchFinding[]}
 */
export function scanPatch(patchText) {
  /** @type {PatchFinding[]} */
  const findings = [];
  for (const added of parseAddedLines(patchText)) {
    if (EXCLUDED_FILES.has(added.file)) continue;
    if (BINARY_EXT.test(added.file)) continue;
    for (const finding of findSecrets(added.text)) {
      findings.push({
        file: added.file,
        line: added.line,
        rule: finding.rule,
        match: finding.match,
      });
    }
  }
  return findings;
}

/** @returns {{ localRef: string, localSha: string, remoteRef: string, remoteSha: string }[]} */
function readRefUpdates() {
  // A terminal is a human, not a pre-push hook: reading it would block
  // waiting for someone to type ref updates. The gate closes stdin before
  // a step runs, so there the read returns at once; this guard is for
  // the person who runs the script by hand and wonders why it hangs.
  if (process.stdin.isTTY) return [];
  /** @type {string} */
  let raw;
  try {
    raw = readFileSync(0, 'utf8');
  } catch {
    return [];
  }
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [localRef, localSha, remoteRef, remoteSha] = line.split(/\s+/);
      return {
        localRef: localRef ?? '',
        localSha: localSha ?? '',
        remoteRef: remoteRef ?? '',
        remoteSha: remoteSha ?? '',
      };
    });
}

/**
 * Commits reachable from `localSha` that the remote side doesn't have yet —
 * exactly what this push will add. An update to an existing ref uses the
 * precise `remoteSha..localSha` range; a brand-new ref (remoteSha is all
 * zero) falls back to everything not already reachable from a known
 * remote-tracking branch, the same bound `git rev-list --not --remotes` uses
 * elsewhere for "what's new locally".
 * @param {string} localSha
 * @param {string} remoteSha
 * @returns {string[]}
 */
function commitsForRefUpdate(localSha, remoteSha) {
  if (!localSha || ZERO_SHA.test(localSha)) return []; // branch deletion, nothing pushed
  const range =
    remoteSha && !ZERO_SHA.test(remoteSha)
      ? [`${remoteSha}..${localSha}`]
      : [localSha, '--not', '--remotes'];
  try {
    const out = execFileSync('git', ['rev-list', ...range], GIT_OPTS);
    return out
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

/** @returns {boolean} */
function isMergeCommit(sha) {
  try {
    const out = execFileSync('git', ['rev-list', '--parents', '-n', '1', sha], GIT_OPTS).trim();
    return out.split(/\s+/).length > 2; // sha + 1 parent = 2 tokens; more means merge
  } catch {
    return false;
  }
}

/** @returns {string} */
function patchForCommit(sha) {
  // Merge commits are skipped by the caller: diff-tree without -m/-c shows
  // no diff for them, so a secret introduced only by a merge's own conflict
  // resolution would go unscanned — a known, narrow gap.
  return execFileSync('git', ['diff-tree', '-p', '--no-color', '-r', sha], GIT_OPTS);
}

function main() {
  const updates = readRefUpdates();
  if (updates.length === 0) {
    console.log('secret-scan-history: no ref updates on stdin, nothing to scan');
    return;
  }

  const commits = new Set();
  for (const update of updates) {
    for (const sha of commitsForRefUpdate(update.localSha, update.remoteSha)) commits.add(sha);
  }

  if (commits.size === 0) {
    console.log('secret-scan-history OK: no new commits to scan');
    return;
  }

  /** @type {{ commit: string, file: string, line: number, rule: string, match: string }[]} */
  const findings = [];
  for (const sha of commits) {
    if (isMergeCommit(sha)) continue;
    for (const finding of scanPatch(patchForCommit(sha))) {
      findings.push({ commit: sha.slice(0, 12), ...finding });
    }
  }

  if (findings.length > 0) {
    console.error(
      `secret-scan-history FAILED: ${findings.length} potential secret(s) found in commit(s) being pushed:`,
    );
    for (const f of findings) {
      console.error(`  ${f.commit} ${f.file}:${f.line}  [${f.rule}]  ${f.match}`);
    }
    console.error(
      '\nGitHub push protection scans every commit in a push, not just the final tree — a secret ' +
        'added and later removed still blocks the push and needs a human decision to rewrite history. ' +
        'Fix it in the commit that introduces it before pushing.',
    );
    process.exit(1);
  }

  console.log(`secret-scan-history OK: ${commits.size} new commit(s) scanned, clean`);
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();
