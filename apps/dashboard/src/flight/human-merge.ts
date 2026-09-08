// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * THE HUMAN MERGE BUTTON — the maintainer's own act, in the app.
 *
 * The KEEPER security-hard rule sends every gate/guard/auth/donation-path
 * PR to `queue-for-human`: the ritual reviews it, reasons about it, and
 * then refuses to merge it. That is correct. What was missing is the
 * other half — the human's answer had no home. The operator asked it
 * plainly (2026-09-09): "איך אני עושה את זה דרך הדשבורד עצמו?" — how do I
 * do it from the dashboard itself. Until now: you couldn't. The panel
 * queued the PR and then sent you to a browser.
 *
 * So this is deliberately NOT an automation. It runs only from an
 * operator's click, only on a PR the ritual itself has queued for a
 * human, and only after re-verifying — fresh from `gh`, never from the
 * previewed card — that:
 *
 *   1. the PR is still open,
 *   2. its head is the exact SHA the operator was looking at,
 *   3. every gating check on that head has passed,
 *   4. GitHub itself reports it mergeable.
 *
 * Any of those failing returns a refusal with the reason, and no `gh
 * merge` is planned. That is the same narrowing-only discipline
 * `pr-review-execute.ts` follows: the client can only ever STOP a merge,
 * never cause one it would not otherwise allow.
 *
 * Squash + delete-branch, matching the ritual's own merge shape, so a
 * human merge and a policy-green merge leave identical history.
 */

import type { CliExec } from '../connection/cli-probe.js';
import { ghExec } from './gh-exec.js';
import { fetchOpenPrCandidates, type PrReviewCandidate } from './pr-review.js';

/** Why a human merge was refused, or that it ran. */
export interface HumanMergeResult {
  readonly merged: boolean;
  /** Plain-language reason — shown verbatim in the panel. */
  readonly reason: string;
  /** The `gh pr merge` exit code, present only when it actually ran. */
  readonly code?: number;
  /** The PR's live facts at decision time, for the panel to re-render. */
  readonly pr?: PrReviewCandidate;
}

/** Checks that do not gate — the same "(optional)" convention
 *  `deriveGateStatus` honors. Kept as its own predicate here so a reader of
 *  this file can see exactly what "every check passed" excludes. */
function isOptionalCheck(name: string): boolean {
  return name.toLowerCase().includes('(optional)');
}

/**
 * The whole refusal decision, pure and testable: given the live PR (or its
 * absence) and the head the operator was looking at, either approve the
 * merge or say why not.
 */
export function judgeHumanMerge(
  pr: PrReviewCandidate | undefined,
  expectedHeadRefOid: string | undefined,
): { readonly allow: boolean; readonly reason: string } {
  if (!pr) {
    return { allow: false, reason: 'That PR is no longer open — nothing to merge.' };
  }
  if (
    expectedHeadRefOid !== undefined &&
    pr.headRefOid !== undefined &&
    pr.headRefOid !== expectedHeadRefOid
  ) {
    return {
      allow: false,
      reason:
        'The head moved since this card was drawn — new commits are on the branch. ' +
        'Re-read the PR and try again.',
    };
  }
  const gating = (pr.checkRuns ?? []).filter((check) => !isOptionalCheck(check.name));
  const notPassed = gating.filter((check) => check.state !== 'pass');
  if (gating.length === 0) {
    return {
      allow: false,
      reason: 'No gating check has reported on this head — there is no green to merge on.',
    };
  }
  if (notPassed.length > 0) {
    const names = notPassed.map((check) => `${check.name} (${check.state})`).join(', ');
    return { allow: false, reason: `Not every check has passed: ${names}.` };
  }
  if (!pr.mergeable) {
    return {
      allow: false,
      reason: pr.mergeStateUnknown
        ? 'GitHub has not computed mergeability for this PR yet — try again shortly.'
        : 'GitHub reports this PR as conflicting — it cannot merge as-is.',
    };
  }
  if (pr.behindBase) {
    return {
      allow: false,
      reason:
        'The branch is behind base and protection requires it up to date — ' +
        'update the branch first.',
    };
  }
  return { allow: true, reason: 'Every gating check passed and GitHub reports it mergeable.' };
}

/** The API shape `POST /api/pr-review/human-merge` wires. */
export type HumanMergeApi = (
  number: number,
  expectedHeadRefOid?: string,
) => Promise<HumanMergeResult>;

/**
 * Builds the human-merge API. Every fact is re-read from `gh` at call
 * time — the previewed card is never trusted for anything but the head SHA
 * it is asserting against.
 */
export function createHumanMergeApi(exec: CliExec = ghExec): HumanMergeApi {
  return async (number, expectedHeadRefOid) => {
    const candidates = await fetchOpenPrCandidates(exec);
    const pr = candidates.find((candidate) => candidate.number === number);
    const verdict = judgeHumanMerge(pr, expectedHeadRefOid);
    if (!verdict.allow) {
      return { merged: false, reason: verdict.reason, ...(pr ? { pr } : {}) };
    }
    const { code } = await exec('gh', [
      'pr',
      'merge',
      String(number),
      '--squash',
      '--delete-branch',
    ]);
    if (code !== 0) {
      return {
        merged: false,
        reason: `gh refused the merge (exit ${code}) — check the PR on GitHub for why.`,
        code,
        ...(pr ? { pr } : {}),
      };
    }
    return {
      merged: true,
      reason: `#${number} squash-merged and its branch deleted.`,
      code,
      ...(pr ? { pr } : {}),
    };
  };
}
