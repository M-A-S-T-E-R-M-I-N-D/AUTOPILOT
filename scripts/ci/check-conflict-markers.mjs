// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * check-conflict-markers — fail CI if a tracked file still carries an
 * unresolved git conflict marker (<<<<<<<, =======, >>>>>>>).
 *
 * Caught live: `docs/BACKLOG-999-ARCHIVE.md` landed a literal
 * `<<<<<<< HEAD` / `=======` / `>>>>>>> <branch>` block in
 * `d448f8b7 chore: recover fleet-5 after the 13:06 power loss` — a real
 * unresolved conflict that shipped because nothing in the repo scanned
 * committed file CONTENT for marker lines. `check-merge-integrity.mjs`
 * does not catch this: it compares tree content across a merge's parents
 * to catch a `-s ours` discard, a different failure class entirely — a
 * merge can be perfectly content-complete and still leave marker lines
 * sitting in a file because the conflict was never actually resolved.
 *
 * Detection: a `<<<<<<< ` or `>>>>>>> ` line start is functionally unique
 * to an unresolved conflict marker — git always follows the seven arrows
 * with a space and a ref name, and nothing legitimate in this repo's
 * tracked tree produces that shape (verified: zero matches outside the one
 * real bug). A bare `=======` line is only flagged when the same file also
 * has a `<<<<<<< ` or `>>>>>>> ` line, since a lone run of seven equals
 * signs can appear in innocent formatting (a Markdown setext-style
 * divider) — the guard-precision doctrine's negative-corpus rule
 * (FAILURE-DOCTRINE row 6: a scanner's false positives train everyone to
 * ignore it).
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const NUL = String.fromCharCode(0);
const START_RE = /^<{7} /;
const END_RE = /^>{7} /;
const MID_RE = /^={7}$/;
const BINARY_EXT = /\.(png|jpe?g|gif|ico|woff2?|ttf|eot|pdf|zip|gz|tgz|db|wasm|node)$/i;

// Stryker disable all: `listTrackedFiles` shells out to `git ls-files` — it
// can only be exercised by running the gate for real. The logic it feeds,
// `findConflictMarkers`, IS mutation-tested.
/** @returns {string[]} */
function listTrackedFiles() {
  const out = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    { windowsHide: true, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  return out.split(NUL).filter(Boolean);
}
// Stryker restore all

/**
 * Scan one file's text for unresolved conflict markers. Pure — no fs/git
 * access — so it is unit-testable directly against fixture strings, same
 * shape as validate-no-personal-paths.mjs's findPersonalPaths().
 * @param {string} text
 * @returns {{ line: number, marker: string }[]}
 */
export function findConflictMarkers(text) {
  const lines = text.split('\n');
  /** @type {{ line: number, marker: string }[]} */
  const starts = [];
  /** @type {{ line: number, marker: string }[]} */
  const ends = [];
  /** @type {{ line: number, marker: string }[]} */
  const mids = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (START_RE.test(line)) starts.push({ line: i + 1, marker: line });
    else if (END_RE.test(line)) ends.push({ line: i + 1, marker: line });
    else if (MID_RE.test(line)) mids.push({ line: i + 1, marker: line });
  }
  if (starts.length === 0 && ends.length === 0) return [];
  return [...starts, ...mids, ...ends].sort((a, b) => a.line - b.line);
}

// Stryker disable all: `main` is the process shell — it reads every tracked
// file from disk and can only be exercised by running the gate for real. The
// logic it delegates to, `findConflictMarkers`, IS mutation-tested.
function main() {
  const files = listTrackedFiles();
  /** @type {{ file: string, line: number, marker: string }[]} */
  const findings = [];

  for (const file of files) {
    if (BINARY_EXT.test(file)) continue;

    let text;
    try {
      text = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    if (text.includes(NUL)) continue;

    for (const finding of findConflictMarkers(text)) {
      findings.push({ file, ...finding });
    }
  }

  if (findings.length > 0) {
    console.error(`conflict-markers FAILED: ${findings.length} unresolved marker line(s) found:`);
    for (const f of findings) {
      console.error(`  ${f.file}:${f.line}  ${f.marker}`);
    }
    console.error('\nResolve the conflict and remove the marker lines before committing.');
    process.exit(1);
  }

  console.log(`conflict-markers OK: clean (${files.length} tracked files scanned)`);
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();
