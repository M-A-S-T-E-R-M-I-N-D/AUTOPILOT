// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The PreToolUse guard entry (`node guard-hook.js <targetRoot>`). Claude Code
 * pipes the tool-call JSON to stdin; we print the official deny JSON (and exit 0)
 * when the Bash command references anything outside the target repo, or print
 * nothing for "no decision". Almost all logic lives in guard.ts (pure, fully
 * tested); this file is mostly the stdin/stdout shim, PLUS the checks that
 * genuinely need I/O:
 * - the pre-commit sibling scan (SLICE-RELAY DUP 2/3): evaluateHookInput's
 *   checks are pure text, but recognizing a stale FLEET digest requires a
 *   fresh `git worktree list` read at the moment a `git commit` is about to
 *   run, so that gather step (adapters/sibling-commit-scan.ts) is invoked
 *   from here, gated behind the cheap isGitCommitCommand text check so
 *   ordinary commands never pay for it. Also skipped while `isMergeCommit`
 *   is true (ap-mtjwbrok-0) — a commit finalizing an in-progress merge
 *   carries forward content git's own merge machinery already reconciled,
 *   not new work the firing is originating, so a stale lane's catch-up
 *   merge can't be starved by an unrelated sibling's claim on one of the
 *   many files it touches.
 * - the WebFetch DNS-rebinding check (THREAT-MODEL.md T6): checkWebFetchTarget
 *   judges the URL's literal hostname with zero I/O, but a hostname that only
 *   resolves to a loopback/private address at request time needs a real DNS
 *   lookup to catch — `checkWebFetchDnsRebinding` runs here, behind the real
 *   `dns.promises.lookup`, only after the literal check has already passed.
 */

import { lookup } from 'node:dns/promises';
import {
  buildDenyDecision,
  checkPreCommitSiblingOverlap,
  checkWebFetchDnsRebinding,
  evaluateHookInput,
  extractBashCommand,
  extractWebFetchUrl,
  isGitCommitCommand,
} from './guard.js';
import {
  gatherSiblingPrimaryClaims,
  gatherStagedFiles,
  isMergeCommit,
} from './adapters/sibling-commit-scan.js';

const targetRoot = process.argv[2] ?? '';

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk: string) => {
  raw += chunk;
});
process.stdin.on('end', () => {
  void handleStdinEnd();
});

async function handleStdinEnd(): Promise<void> {
  if (targetRoot.length === 0) {
    process.exit(0); // misconfigured — fail open, audit backstops
    return;
  }
  const decision = evaluateHookInput(raw, targetRoot);
  if (decision !== null) {
    process.stdout.write(decision);
    process.exit(0);
    return;
  }

  const webFetchUrl = extractWebFetchUrl(raw);
  if (webFetchUrl !== null) {
    const verdict = await checkWebFetchDnsRebinding(webFetchUrl, (hostname) =>
      lookup(hostname, { all: true }),
    );
    if (!verdict.allowed) {
      process.stdout.write(buildDenyDecision(verdict.reason ?? 'blocked'));
      process.exit(0);
      return;
    }
  }

  const command = extractBashCommand(raw);
  if (command !== null && isGitCommitCommand(command) && !isMergeCommit(targetRoot)) {
    const verdict = checkPreCommitSiblingOverlap(
      gatherStagedFiles(targetRoot),
      gatherSiblingPrimaryClaims(targetRoot),
    );
    if (!verdict.allowed) {
      // Stryker disable next-line StringLiteral: checkPreCommitSiblingOverlap's
      // only `allowed: false` return site always sets an explicit non-null
      // `reason` string — having just failed `verdict.allowed`, `verdict.reason`
      // can never be null here, so the `?? 'blocked'` fallback is unreachable.
      // Provably equivalent, not killable.
      process.stdout.write(buildDenyDecision(verdict.reason ?? 'blocked'));
      process.exit(0);
      return;
    }
  }

  process.exit(0);
}
