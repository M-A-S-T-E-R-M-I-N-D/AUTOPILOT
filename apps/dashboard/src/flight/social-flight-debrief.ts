// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The Social Flight's SOCIAL debrief (epic 0016 "The GitHub Social Flight",
 * slice 5/6 — board web-mtpzzxw4-au1b6x: "every social action in the flight
 * log + a SOCIAL section in the debrief (what was said/filed/closed, caps
 * consumed)"). Each woven-in pass already prints its own line the moment it
 * runs (`social-flight-pass.ts`); {@link socialFlightDebriefOf} folds a
 * whole flight's pass outcomes — start, every interval, end — into ONE
 * digest, and {@link socialFlightDebriefLine} renders it as the flight log's
 * end-of-flight SOCIAL line, the shape `near-miss.ts`'s
 * `nearMissDebriefLine` gave the SAFETY-II ritual, so the flight's social
 * footprint reads in one place rather than scattered between firings.
 *
 * Pure: no I/O, no `gh` call — `fly.ts` collects the outcomes and prints the
 * line. Honest about the read-only passes it summarizes: no caller hands a
 * pass candidates yet and nothing executes, so the line says "nothing
 * posted" outright instead of a said/filed/closed tally that could only read
 * zero, and "caps consumed" is the ALLOWED plan against the summed per-pass
 * budget. The posted tally lands with the execute half.
 */

import type { SocialFlightPassOutcome } from './social-flight-pass.js';

/** One flight's social passes, summed. The two `skipped*` counts are the
 *  refusals the pass itself explains in the flight log (a foreign target, a
 *  disconnected `gh`) — the ones an operator who turned the toggle ON wants
 *  accounted for; `'toggle-off'`/`'phase-not-enabled'` are the expected
 *  silent case and count nowhere. The budgets sum each ran pass's own caps,
 *  since `social-pass.ts`'s `planSocialProtocol` spends them per pass. */
export interface SocialFlightDebrief {
  readonly passesRan: number;
  readonly skippedForeignTarget: number;
  readonly skippedGhDisconnected: number;
  readonly newIssuesAllowed: number;
  readonly newIssueBudget: number;
  readonly commentsAllowed: number;
  readonly commentBudget: number;
  readonly queued: number;
  readonly duplicate: number;
  readonly refused: number;
}

/**
 * Sums a flight's social-pass outcomes into its {@link SocialFlightDebrief}.
 * Returns `null` when no pass ran and none was refused for a reason the
 * flight log explained — a flight with the toggle off says nothing social at
 * all, the same silence the pass keeps.
 */
export function socialFlightDebriefOf(
  outcomes: readonly SocialFlightPassOutcome[],
): SocialFlightDebrief | null {
  let passesRan = 0;
  let skippedForeignTarget = 0;
  let skippedGhDisconnected = 0;
  let newIssuesAllowed = 0;
  let newIssueBudget = 0;
  let commentsAllowed = 0;
  let commentBudget = 0;
  let queued = 0;
  let duplicate = 0;
  let refused = 0;
  for (const outcome of outcomes) {
    if (!outcome.ran) {
      if (outcome.reason === 'foreign-target') skippedForeignTarget++;
      if (outcome.reason === 'gh-disconnected') skippedGhDisconnected++;
      continue;
    }
    passesRan++;
    newIssueBudget += outcome.caps.maxNewIssues;
    commentBudget += outcome.caps.maxComments;
    for (const action of outcome.verdict.allowed) {
      if (action.kind === 'new-issue') newIssuesAllowed++;
      else commentsAllowed++;
    }
    queued += outcome.verdict.queued.length;
    duplicate += outcome.verdict.duplicate.length;
    refused += outcome.verdict.refused.length;
  }
  if (passesRan + skippedForeignTarget + skippedGhDisconnected === 0) return null;
  return {
    passesRan,
    skippedForeignTarget,
    skippedGhDisconnected,
    newIssuesAllowed,
    newIssueBudget,
    commentsAllowed,
    commentBudget,
    queued,
    duplicate,
    refused,
  };
}

/** The flight log's SOCIAL line for a {@link SocialFlightDebrief}, in the
 *  per-pass line's own `(s)` wording. The caps and verdict totals appear only
 *  when a pass ran — a 0/0 budget is not a reading — and each refusal reason
 *  appears only when it happened. */
export function socialFlightDebriefLine(d: SocialFlightDebrief): string {
  const parts = [`${d.passesRan} pass(es) ran`];
  if (d.passesRan > 0) {
    parts.push(
      `caps consumed ${d.newIssuesAllowed}/${d.newIssueBudget} new issue(s), ` +
        `${d.commentsAllowed}/${d.commentBudget} comment(s)`,
      `${d.queued} queued, ${d.duplicate} duplicate, ${d.refused} refused`,
    );
  }
  if (d.skippedForeignTarget > 0) parts.push(`${d.skippedForeignTarget} skipped (foreign target)`);
  if (d.skippedGhDisconnected > 0) {
    parts.push(`${d.skippedGhDisconnected} skipped (gh not connected)`);
  }
  return `SOCIAL debrief: ${parts.join('; ')}; nothing posted (read-only passes).`;
}
