#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * BOARD FLOOD AUDITOR — the permanent counter for the anti-flood law
 * (docs/ATTRIBUTION.md §edit-over-append, operator directive 2026-09-09:
 * "חשוב לוודא שלא הצפנו ולא מציפים סתם את הלוחות").
 *
 * Three flood classes, each a real incident this script exists to stop
 * from recurring:
 *
 *  1. NEAR-DUPLICATE — two messages from the same author whose text is
 *     >=90% similar. Root cause seen on PR #33: an approval whose body
 *     carried `≥` and `don't` looked like it failed on the Windows shell,
 *     so it was retried ASCII-safe — but the first had landed. A retry
 *     after an apparent failure that actually succeeded.
 *  2. CONSECUTIVE-RUN — three or more messages in a row from the same
 *     author with nobody else speaking between (issue #16 carried three).
 *     Two is the ceiling; three is a cleanup bug.
 *  3. RAPID-FIRE — two messages from the same author inside 120s. Almost
 *     always one thought that should have been one message, or a retry.
 *
 * Read-only: prints findings and exits non-zero when any are found. Never
 * posts, edits or deletes anything — cleanup stays a human decision.
 *
 * Usage:
 *   node scripts/ci/audit-board-flood.mjs [--repo owner/name] [--json]
 */

import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = argValue('--repo') ?? 'M-A-S-T-E-R-M-I-N-D/AUTOPILOT';
const AS_JSON = process.argv.includes('--json');

/** Similarity at or above which two same-author messages are a duplicate. */
export const DUPLICATE_RATIO = 0.9;
/** Same-author messages this many ms apart or less are rapid-fire. */
export const RAPID_FIRE_MS = 120_000;
/** Consecutive same-author messages allowed before it reads as a flood. */
export const CONSECUTIVE_CEILING = 2;
/** Messages shorter than this are greetings/acks — too small to compare. */
export const MIN_COMPARE_LENGTH = 40;

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i === -1 ? undefined : process.argv[i + 1];
}

function gh(path) {
  const out = execFileSync('gh', ['api', path, '--paginate'], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  // --paginate concatenates JSON arrays as `][` at page seams.
  return JSON.parse(out.replace(/\]\s*\[/g, ','));
}

/** Collapses the noise two retries of the same text differ by — smart
 *  punctuation swapped for ASCII, whitespace runs, case — so a retry that
 *  only survived the shell differently still reads as the same message. */
export function normalize(body) {
  return (body ?? '')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/≥/g, '>=')
    .replace(/≤/g, '<=')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Word-level Jaccard similarity — robust to the small edits a retry makes
 *  (a clause reworded, a symbol downgraded) in a way character diffing is
 *  not, and cheap enough for whole-board sweeps. */
export function similarity(a, b) {
  const setA = new Set(a.split(' '));
  const setB = new Set(b.split(' '));
  if (setA.size === 0 || setB.size === 0) return 0;
  let shared = 0;
  for (const word of setA) if (setB.has(word)) shared += 1;
  return shared / (setA.size + setB.size - shared);
}

/** Every message on one thread — issue comments and PR reviews alike —
 *  flattened into one timeline, because a review and a comment posted
 *  seconds apart flood a reader's page just the same. */
function threadMessages(number, isPr) {
  const comments = gh(`repos/${REPO}/issues/${number}/comments`).map((c) => ({
    kind: 'comment',
    id: c.id,
    author: c.user?.login ?? '?',
    at: c.created_at,
    body: c.body ?? '',
    url: c.html_url,
  }));
  const reviews = isPr
    ? gh(`repos/${REPO}/pulls/${number}/reviews`)
        .filter((r) => (r.body ?? '').trim().length > 0)
        .map((r) => ({
          kind: `review:${r.state}`,
          id: r.id,
          author: r.user?.login ?? '?',
          at: r.submitted_at,
          body: r.body ?? '',
          url: r.html_url,
        }))
    : [];
  return [...comments, ...reviews].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

export function auditThread(thread, messages) {
  const findings = [];
  const normalized = messages.map((m) => normalize(m.body));

  for (let i = 0; i < messages.length; i += 1) {
    for (let j = i + 1; j < messages.length; j += 1) {
      if (messages[i].author !== messages[j].author) continue;
      if (normalized[i].length < MIN_COMPARE_LENGTH) continue;
      const ratio = similarity(normalized[i], normalized[j]);
      if (ratio >= DUPLICATE_RATIO) {
        findings.push({
          thread,
          kind: 'NEAR-DUPLICATE',
          author: messages[i].author,
          detail: `${Math.round(ratio * 100)}% identical to an earlier ${messages[i].kind} (${messages[i].id})`,
          url: messages[j].url,
        });
      }
    }
  }

  let runAuthor = null;
  let runLength = 0;
  let runStart = null;
  for (const message of messages) {
    if (message.author === runAuthor) {
      runLength += 1;
    } else {
      runAuthor = message.author;
      runLength = 1;
      runStart = message;
    }
    if (runLength === CONSECUTIVE_CEILING + 1) {
      findings.push({
        thread,
        kind: 'CONSECUTIVE-RUN',
        author: runAuthor,
        detail: `${runLength} messages in a row with nobody else speaking (run starts at ${runStart.id})`,
        url: message.url,
      });
    }
  }

  for (let i = 1; i < messages.length; i += 1) {
    const gap = Date.parse(messages[i].at) - Date.parse(messages[i - 1].at);
    if (messages[i].author === messages[i - 1].author && gap <= RAPID_FIRE_MS) {
      findings.push({
        thread,
        kind: 'RAPID-FIRE',
        author: messages[i].author,
        detail: `${Math.round(gap / 1000)}s after the same author's previous ${messages[i - 1].kind}`,
        url: messages[i].url,
      });
    }
  }

  return findings;
}

function main() {
  const issues = gh(`repos/${REPO}/issues?state=all&per_page=100`);
  const findings = [];
  for (const issue of issues) {
    const messages = threadMessages(issue.number, Boolean(issue.pull_request));
    if (messages.length < 2) continue;
    findings.push(
      ...auditThread(`${issue.pull_request ? 'PR' : 'issue'} #${issue.number}`, messages),
    );
  }

  if (AS_JSON) {
    console.log(JSON.stringify({ repo: REPO, findings }, null, 2));
  } else if (findings.length === 0) {
    console.log(`✓ no board flood found across ${issues.length} threads in ${REPO}`);
  } else {
    console.log(
      `✗ ${findings.length} flood finding(s) across ${issues.length} threads in ${REPO}\n`,
    );
    for (const f of findings) {
      console.log(`  ${f.kind}  ${f.thread}  @${f.author}`);
      console.log(`    ${f.detail}`);
      console.log(`    ${f.url}`);
    }
  }
  process.exitCode = findings.length === 0 ? 0 : 1;
}

// Guarded like every sibling scanner (secret-scan.mjs, validate-no-personal-
// paths.mjs, …): importing this module for its pure functions (as the test
// suite does) must never trigger a live `gh api` call against the real repo.
const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();
