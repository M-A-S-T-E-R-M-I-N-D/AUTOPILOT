// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Pure per-section diff-signature helper for the fleet card renderer —
 * client-only (no server counterpart, unlike `shared/*.ts`), so it lives in
 * `web/` rather than `shared/` (epic 0002 "shell decomposition", slice 2:
 * feature-module split of `shell.ts`), following the same pattern
 * `flight-metrics.ts`/`heatmap.ts`/`activity-log.ts` proved.
 *
 * `web/shell.ts` embeds this module's real compiled source into the
 * generated `/app.js` text via `.toString()` — see `fleetJs()` — instead of
 * hand-retyping it, so the two copies can no longer drift apart.
 */

/** A severity gauge's open-findings breakdown, as read by {@link cardSectionSigs}. */
export interface CardSectionGauge {
  readonly critical: number;
  readonly high: number;
  readonly medium: number;
  readonly low: number;
}

/** The fields of a fleet card {@link cardSectionSigs} reads to decide which DOM section needs a rebuild. */
export interface CardSectionInput {
  readonly id: string;
  readonly name: string;
  readonly status: string;
  readonly anomalies: readonly unknown[];
  readonly soulReviewed: boolean;
  readonly soulProposed: string | null;
  readonly soulPrevious: string | null;
  readonly primaryLanguage: string;
  readonly fileCount: number;
  readonly totalBytes: number;
  readonly activity: readonly unknown[];
  readonly flightLog: readonly unknown[];
  readonly tasks: readonly unknown[];
  readonly firings: number;
  readonly shipped: number;
  readonly shipRate: number | null;
  readonly recentShipRate: number | null;
  readonly openFindings: number;
  readonly lastActivityAt: number | null;
  readonly gauge: CardSectionGauge;
}

/** {@link cardSectionSigs}'s result: one diff signature per card section. */
export interface CardSectionSigs {
  readonly head: string;
  readonly meta: string;
  readonly worker: string;
  readonly office: string;
  readonly stats: string;
  readonly gauge: string;
  readonly actions: string;
}

/** One diff signature per card section (head/meta/worker/office/stats/gauge/actions) — a
 *  section only gets rebuilt when ITS OWN signature changes, so an SSE tick that only moves
 *  live-firing data (worker/office) leaves head/meta/stats/gauge/actions — and the Details
 *  panel's own subsections, see `detailSectionSigs` in `shell.ts` — completely untouched.
 *  Fixes the live-blink bug: with a single whole-card sig, ANY field change rebuilt the
 *  entire card every ~1.5s tick, so an open Details panel a reader had scrolled into lost
 *  its scroll position, focus, and selection every tick a firing was in progress. */
export function cardSectionSigs(c: CardSectionInput): CardSectionSigs {
  const liveSig = JSON.stringify([c.status, c.activity, c.flightLog, c.tasks]);
  return {
    head: JSON.stringify([c.id, c.name, c.status, c.anomalies, c.soulReviewed]),
    meta: JSON.stringify([c.primaryLanguage, c.fileCount, c.totalBytes]),
    worker: liveSig,
    office: liveSig,
    stats: JSON.stringify([c.firings, c.shipped, c.shipRate, c.recentShipRate]),
    gauge: JSON.stringify([c.openFindings, c.lastActivityAt, c.gauge]),
    actions: JSON.stringify([c.id, c.name, c.soulProposed, c.soulPrevious]),
  };
}
