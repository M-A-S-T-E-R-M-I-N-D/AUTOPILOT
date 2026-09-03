// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Pure per-subsection diff-signature helper for the fleet card's "Details"
 * panel — client-only (no server counterpart, unlike `shared/*.ts`), so it
 * lives in `web/` rather than `shared/` (epic 0002 "shell decomposition",
 * slice 2: feature-module split of `shell.ts`), following the same pattern
 * `card-sections.ts`/`flight-metrics.ts`/`heatmap.ts`/`activity-log.ts`
 * proved. `card-sections.ts`'s own doc comment flagged this as the follow-on
 * cut it deliberately deferred.
 *
 * The flight-log/activity/timeline signatures read several module-level
 * disclosure-state maps (`flightLogExtra`, `flightLogMore`,
 * `openFlightLogAll`, `openFlightRow`, `flightLogLoading`, `openPhases`,
 * `openFirings`) that live in `shell.ts`, keyed by project id. Rather than
 * importing those maps (a real cross-module import type-checks fine but
 * breaks once Vitest's SSR transform rewrites it to a reference that
 * doesn't survive `.toString()` extraction — see `shared/file-nodes.ts`),
 * this function takes each project's already-looked-up value via injection,
 * mirroring `heatmapDays`/`actMeta`'s existing pattern.
 *
 * `web/shell.ts` embeds this module's real compiled source into the
 * generated `/app.js` text via `.toString()` — see `fleetJs()` — instead of
 * hand-retyping it, so the two copies can no longer drift apart.
 */

/** The fields of a fleet card {@link detailSectionSigs} reads to decide which "Details" subsection needs a rebuild. */
export interface DetailSectionInput {
  readonly id: string;
  readonly gate?: unknown;
  readonly backedUp?: unknown;
  readonly languages?: readonly unknown[] | null;
  readonly topDirs?: readonly unknown[] | null;
  readonly hotFiles?: readonly unknown[] | null;
  readonly flightLog?: readonly unknown[] | null;
  readonly tasks?: readonly unknown[] | null;
  readonly flightLogHasMore?: unknown;
  readonly activity?: readonly unknown[] | null;
  readonly status?: unknown;
  readonly firings?: unknown;
  readonly cost?: unknown;
  readonly tokensIn?: unknown;
  readonly tokensOut?: unknown;
  readonly shipRate?: unknown;
}

/** {@link detailSectionSigs}'s result: one diff signature per "Details" subsection. */
export interface DetailSectionSigs {
  readonly facts: string;
  readonly languages: string;
  readonly dirs: string;
  readonly hotfiles: string;
  readonly flightlog: string;
  readonly activity: string;
  readonly timeline: string;
  readonly metrics: string;
}

/** One diff signature per "Details" subsection (facts/languages/dirs/hotfiles/
 *  flightlog/activity/timeline/metrics) — mirrors `cardSectionSigs`'s live-blink
 *  fix for the card's own sections: a subsection only gets rebuilt when ITS OWN
 *  signature changes, so an open Details panel a reader scrolled into keeps its
 *  scroll position, focus, and selection across an SSE tick that only moved
 *  data another subsection reads. */
export function detailSectionSigs(
  c: DetailSectionInput,
  flightLogExtra: unknown,
  flightLogMore: unknown,
  openFlightLogAll: unknown,
  openFlightRow: unknown,
  flightLogLoading: unknown,
  openPhases: unknown,
  openFirings: unknown,
): DetailSectionSigs {
  const liveSig = JSON.stringify([c.status, c.activity, c.flightLog, c.tasks]);
  return {
    facts: JSON.stringify([c.gate, c.backedUp]),
    languages: JSON.stringify(c.languages || []),
    dirs: JSON.stringify(c.topDirs || []),
    hotfiles: JSON.stringify(c.hotFiles || []),
    // Mirrors flightLogNode's own inputs, including the module-level maps a
    // "show all" / "load more" click mutates outside of c — otherwise
    // those clicks (which force a re-render via rerenderSoon) would find an
    // unchanged sig and leave the section stale.
    flightlog: JSON.stringify([
      c.flightLog,
      c.tasks,
      c.flightLogHasMore,
      flightLogExtra,
      flightLogMore,
      openFlightLogAll,
      openFlightRow,
      flightLogLoading,
    ]),
    activity: JSON.stringify([c.activity, liveSig, openPhases]),
    timeline: JSON.stringify([c.activity, c.tasks, c.flightLog, openFirings]),
    metrics: JSON.stringify([
      c.firings,
      c.cost,
      c.tokensIn,
      c.tokensOut,
      c.shipRate,
      c.flightLog,
      c.tasks,
    ]),
  };
}
