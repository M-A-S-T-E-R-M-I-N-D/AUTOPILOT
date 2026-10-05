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
 *
 * fly.ts also persists the digest as one {@link SOCIAL_DEBRIEF_EVENT} event
 * per flight, the `near-miss-debrief` precedent, so the dashboard's FLIGHT
 * DEBRIEF panel can serve it later; {@link parseSocialFlightDebrief} is the
 * read-back half, as pure as `near-miss.ts`'s `parseNearMissCounts`.
 */

import type { MirrorPreviewOutcome, SocialFlightPassOutcome } from './social-flight-pass.js';

/** The standalone Fly GitHub flight's mirror-pass preview counts
 *  (`social-flight-pass.ts`'s `MirrorPreviewRan` without its `ran` tag):
 *  what the dashboard's mirror-pass button WOULD close, reopen, note or
 *  settle — previewed, never applied. */
export interface SocialFlightMirrorDigest {
  readonly checked: number;
  readonly toClose: number;
  readonly toReopen: number;
  readonly toNote: number;
  readonly toSettle: number;
  readonly inSync: number;
}

/** One flight's social passes, summed. The two `skipped*` counts are the
 *  refusals the pass itself explains in the flight log (a foreign target, a
 *  disconnected `gh`) — the ones an operator who turned the toggle ON wants
 *  accounted for; `'toggle-off'`/`'phase-not-enabled'` are the expected
 *  silent case and count nowhere. The budgets sum each ran pass's own caps,
 *  since `social-pass.ts`'s `planSocialProtocol` spends them per pass.
 *  `mirror` is present only when a standalone Fly GitHub flight's mirror
 *  preview ran; a code flight runs none, and a preview that skipped quietly
 *  printed nothing to sum. */
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
  readonly mirror?: SocialFlightMirrorDigest;
}

/**
 * Sums a flight's social-pass outcomes into its {@link SocialFlightDebrief},
 * with the standalone flight's `mirror` preview folded in when it ran.
 * Returns `null` when no pass ran and none was refused for a reason the
 * flight log explained — a flight with the toggle off says nothing social at
 * all, the same silence the pass keeps.
 */
export function socialFlightDebriefOf(
  outcomes: readonly SocialFlightPassOutcome[],
  mirror?: MirrorPreviewOutcome,
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
  const digest: SocialFlightDebrief = {
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
  if (!mirror?.ran) return digest;
  const { ran: _ran, ...counts } = mirror;
  return { ...digest, mirror: counts };
}

/** The flight log's SOCIAL line for a {@link SocialFlightDebrief}, in the
 *  per-pass line's own `(s)` wording. The caps and verdict totals appear only
 *  when a pass ran — a 0/0 budget is not a reading — then the mirror
 *  preview's counts when there are any, worded as a preview; each refusal
 *  reason appears only when it happened. */
export function socialFlightDebriefLine(d: SocialFlightDebrief): string {
  const parts = [`${d.passesRan} pass(es) ran`];
  if (d.passesRan > 0) {
    parts.push(
      `caps consumed ${d.newIssuesAllowed}/${d.newIssueBudget} new issue(s), ` +
        `${d.commentsAllowed}/${d.commentBudget} comment(s)`,
      `${d.queued} queued, ${d.duplicate} duplicate, ${d.refused} refused`,
    );
  }
  if (d.mirror) {
    const m = d.mirror;
    parts.push(
      `mirror pass previewed ${m.checked} github-linked task(s) — ${m.toClose} to close, ` +
        `${m.toReopen} to reopen, ${m.toNote} unverified note(s), ${m.toSettle} to settle, ` +
        `${m.inSync} in sync`,
    );
  }
  if (d.skippedForeignTarget > 0) parts.push(`${d.skippedForeignTarget} skipped (foreign target)`);
  if (d.skippedGhDisconnected > 0) {
    parts.push(`${d.skippedGhDisconnected} skipped (gh not connected)`);
  }
  return `SOCIAL debrief: ${parts.join('; ')}; nothing posted (read-only passes).`;
}

/** The `events.type` fly.ts persists a flight's {@link SocialFlightDebrief}
 *  under, its JSON verbatim. A silent flight (a `null` digest) writes no row,
 *  so a reader bounds its search by the flight's own start, never just "the
 *  newest one". */
export const SOCIAL_DEBRIEF_EVENT = 'social-debrief';

const SOCIAL_DEBRIEF_FIELDS = [
  'passesRan',
  'skippedForeignTarget',
  'skippedGhDisconnected',
  'newIssuesAllowed',
  'newIssueBudget',
  'commentsAllowed',
  'commentBudget',
  'queued',
  'duplicate',
  'refused',
] as const satisfies readonly (keyof SocialFlightDebrief)[];

const SOCIAL_MIRROR_FIELDS = [
  'checked',
  'toClose',
  'toReopen',
  'toNote',
  'toSettle',
  'inSync',
] as const satisfies readonly (keyof SocialFlightMirrorDigest)[];

/** Exactly `fields`' counts off `record`, or `null` when `record` is not a
 *  plain object or any of them is not a non-negative whole number. */
function countsOf<K extends string>(
  record: unknown,
  fields: readonly K[],
): Record<K, number> | null {
  if (typeof record !== 'object' || record === null || Array.isArray(record)) return null;
  const values = record as Partial<Record<K, unknown>>;
  const counts = {} as Record<K, number>;
  for (const field of fields) {
    const v = values[field];
    if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < 0) return null;
    counts[field] = v;
  }
  return counts;
}

/**
 * Parses one persisted {@link SOCIAL_DEBRIEF_EVENT} payload back into its
 * {@link SocialFlightDebrief}. Defensive like the read-model's other event
 * parsers: a missing, malformed or partial payload, or any count that is not
 * a non-negative whole number, yields `null` (skip that row) rather than
 * throwing or reading a gap as zero; a stray key never comes along. A row
 * without `mirror` (every code flight's, and every row written before the
 * mirror preview joined the digest) reads without one; a `mirror` that is
 * there but malformed refuses the row like any other bad count.
 */
export function parseSocialFlightDebrief(payload: string | null): SocialFlightDebrief | null {
  if (payload === null) return null;
  let record: unknown;
  try {
    record = JSON.parse(payload);
  } catch {
    return null;
  }
  const digest = countsOf(record, SOCIAL_DEBRIEF_FIELDS);
  if (digest === null) return null;
  const rawMirror = (record as { readonly mirror?: unknown }).mirror;
  if (rawMirror === undefined) return digest;
  const mirror = countsOf(rawMirror, SOCIAL_MIRROR_FIELDS);
  return mirror === null ? null : { ...digest, mirror };
}
