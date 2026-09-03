// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Pure tooltip/aria-label text math for the project page's "Recently
 * shipped" flight summary line — client-only (no server counterpart, unlike
 * `shared/flight-summary.ts`, whose `finishedFlightSummaries` this module's
 * caller feeds), so it lives in `web/` rather than `shared/` (epic 0002
 * "shell decomposition", slice 2: feature-module split of `shell.ts`),
 * following the same pattern `flight-map.ts`'s `fnodeTip` proved.
 *
 * `web/shell.ts` embeds this module's real compiled source into the
 * generated `/app.js` text via `.toString()` — see `fleetJs()` — instead of
 * hand-retyping it, so the two copies can no longer drift apart.
 */

/** The {@link shared/flight-summary.ts} `FlightSummary` fields {@link flightSummaryLineMeta} reads. */
export interface FlightSummaryLineInput {
  readonly headline: string;
  readonly cost: number;
  /** Cost semantics v3 (epic 0013) — `null`/`undefined` when unconfigured or
   *  the firing predates this being tracked; {@link flightSummaryLineMeta}
   *  then leaves the real-cost chip fields null too. */
  readonly realCostUsd?: number | null;
  readonly closedTaskTitle: string | null;
  readonly at: number;
}

/** One "Recently shipped" line's text/tip/aria-label triples for its headline,
 *  cost, optional closed-task chip, and relative timestamp. `closedText`/
 *  `closedTip`/`closedAriaLabel` are `null` when the flight closed no task —
 *  the caller skips rendering that chip entirely, same as the source loop
 *  it replaces. */
export interface FlightSummaryLineMeta {
  readonly headlineTip: string;
  readonly headlineAriaLabel: string;
  readonly costText: string;
  readonly costTip: string;
  readonly costAriaLabel: string;
  readonly realCostText: string | null;
  readonly realCostTip: string | null;
  readonly realCostAriaLabel: string | null;
  readonly closedText: string | null;
  readonly closedTip: string | null;
  readonly closedAriaLabel: string | null;
  readonly agoText: string;
  readonly agoTip: string;
  readonly agoAriaLabel: string;
}

/** A finished flight's summary line, resolved into the text/tip/aria-label
 *  triples `flightSummarySection`'s per-line loop previously computed inline
 *  across four statements before building each `<span>`. Takes
 *  `fmtCost`/`fmtAgo` via injection rather than importing them from
 *  `./format.ts`, the same `flightBarMeta`/`actMeta` pattern every module in
 *  this epic uses to stay import-free. */
export function flightSummaryLineMeta(
  s: FlightSummaryLineInput,
  fmtCost: (n: number) => string,
  fmtAgo: (at: number) => string,
): FlightSummaryLineMeta {
  const costText = fmtCost(s.cost);
  const agoText = fmtAgo(s.at);
  const realCostFormatted =
    s.realCostUsd === null || s.realCostUsd === undefined ? null : fmtCost(s.realCostUsd);
  return {
    headlineTip: 'What this firing shipped',
    headlineAriaLabel: 'shipped: ' + s.headline,
    costText: costText,
    costTip: 'Total spend for this firing',
    costAriaLabel: 'cost: ' + costText,
    realCostText: realCostFormatted === null ? null : 'real ' + realCostFormatted,
    realCostTip:
      realCostFormatted === null
        ? null
        : 'Real cost — apportioned by your subscription share, not API list price',
    realCostAriaLabel: realCostFormatted === null ? null : 'real cost: ' + realCostFormatted,
    closedText: s.closedTaskTitle ? 'closed' : null,
    closedTip: s.closedTaskTitle ? 'Closed task: ' + s.closedTaskTitle : null,
    closedAriaLabel: s.closedTaskTitle ? 'closed task: ' + s.closedTaskTitle : null,
    agoText: agoText,
    agoTip: 'When this firing shipped',
    agoAriaLabel: 'shipped ' + agoText,
  };
}
