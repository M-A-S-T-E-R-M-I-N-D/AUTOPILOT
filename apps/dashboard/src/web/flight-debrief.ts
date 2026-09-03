// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * FLIGHT DEBRIEF digest (board web-msnt50ct-oezq8r): "when a flight ends,
 * the landing card gains a digest — ships/deaths, $, duration, best and
 * worst firing, notable events — one glance tells the whole story." Pure
 * aggregation over a flight's firing log — client-only (no server
 * counterpart), so it lives in `web/` rather than `shared/` (epic 0002
 * "shell decomposition", slice 2), following the same pattern
 * `flight-metrics.ts`/`heatmap.ts` proved. Takes `verdictOf` via injection
 * rather than importing `flightVerdictOf` from `./flight-metrics.js`, the
 * same `heatmapDays` pattern every module in this epic uses to stay
 * import-free (these modules get spliced into the client bundle via
 * `.toString()`, which carries only the function's own source text).
 *
 * `web/shell.ts` embeds this module's real compiled source into the
 * generated `/app.js` text via `.toString()` — see `fleetJs()` — instead of
 * hand-retyping it, so the two copies can no longer drift apart.
 */

/** A flight-log entry's fields {@link flightDebriefOf} aggregates. */
export interface FlightDebriefEntry {
  readonly shipped: boolean;
  readonly cost: number;
  readonly durationMs?: number | null;
  readonly guardDenials?: number;
  readonly autoformatRescued?: boolean;
}

/** The whole-flight digest {@link flightDebriefOf} returns. `best`/`worst`
 *  carry the ORIGINAL log entries (not a derived subset) so a caller that
 *  already has `flightHeadlineOf`/`taskById` in scope can resolve their
 *  headline itself, the same "compose at the call site" reasoning
 *  `flightTimelineStrip`'s DOM loop already applies to `flightBarMeta`. */
export interface FlightDebrief<F> {
  readonly firings: number;
  readonly shipped: number;
  readonly deaths: number;
  readonly totalCost: number;
  readonly totalDurationMs: number;
  readonly guardDenials: number;
  readonly remediations: number;
  readonly best: F | null;
  readonly worst: F | null;
}

/**
 * Aggregates a flight's firings into the FLIGHT DEBRIEF digest. `deaths`
 * counts only the red-tier verdicts ({@link flightVerdictOf} in
 * `flight-metrics.ts`: 'reverted', 'turn-capped', 'timed-out', 'errored') — a
 * checkpointed or unverified firing packed real WIP into a commit and
 * doesn't read as a failure. `best` is the cheapest SHIPPED firing (the
 * most cost-efficient win); `worst` is the priciest firing that did NOT
 * ship (the costliest dead end) — both `null` when the flight has none of
 * that kind. Returns `null` for an empty log rather than a digest of
 * zeroes — nothing to debrief yet.
 */
export function flightDebriefOf<F extends FlightDebriefEntry>(
  log: readonly F[],
  verdictOf: (f: F) => string,
): FlightDebrief<F> | null {
  if (!log.length) return null;
  let shipped = 0;
  let deaths = 0;
  let totalCost = 0;
  let totalDurationMs = 0;
  let guardDenials = 0;
  let remediations = 0;
  let best: F | null = null;
  let worst: F | null = null;
  for (const f of log) {
    if (f.shipped) shipped++;
    const verdict = verdictOf(f);
    if (
      verdict === 'reverted' ||
      verdict === 'turn-capped' ||
      verdict === 'timed-out' ||
      verdict === 'errored'
    )
      deaths++;
    totalCost += f.cost || 0;
    totalDurationMs += f.durationMs || 0;
    guardDenials += f.guardDenials || 0;
    if (f.autoformatRescued) remediations++;
    if (f.shipped && (!best || f.cost < best.cost)) best = f;
    if (!f.shipped && (!worst || f.cost > worst.cost)) worst = f;
  }
  return {
    firings: log.length,
    shipped,
    deaths,
    totalCost,
    totalDurationMs,
    guardDenials,
    remediations,
    best,
    worst,
  };
}

/** One digest stat chip's text/tip/aria-label triple, in `tipChip`'s own
 *  argument order — the same shape `stat-tiles.ts`'s `RoundStatItem` uses. */
export type FlightDebriefChipItem = readonly [text: string, tip: string, ariaLabel: string];

/** The FLIGHT DEBRIEF panel's stat-chip triples (shipped, died, total spend,
 *  total duration), in the panel's fixed render order. Takes
 *  `fmtCost`/`fmtDuration` via injection rather than importing them from
 *  `./format.ts`, the same `roundStatItems`/`doraTileItems` pattern. */
export function flightDebriefChipItems<F>(
  d: FlightDebrief<F>,
  fmtCost: (n: number) => string,
  fmtDuration: (ms: number) => string,
): readonly FlightDebriefChipItem[] {
  return [
    [
      d.shipped + ' shipped',
      'Firings that passed the gate and landed a real commit',
      d.shipped + ' shipped',
    ],
    [
      d.deaths + ' died',
      'Firings that reverted, hit the turn cap, timed out, or errored with nothing committed',
      d.deaths + ' died',
    ],
    [
      fmtCost(d.totalCost),
      'Total spend across this flight',
      'total spend: ' + fmtCost(d.totalCost),
    ],
    [
      fmtDuration(d.totalDurationMs),
      'Total wall-clock time across this flight',
      'total duration: ' + fmtDuration(d.totalDurationMs),
    ],
  ];
}

/** The FLIGHT DEBRIEF panel's "notable events" line items — guard denials
 *  (PreToolUse containment/read-hygiene hits) and mechanical remediations
 *  (`RemediatingGate` auto-fixes), each omitted entirely when zero rather
 *  than padding the line with a "0 guard denials" non-event. Returns
 *  tip-bearing triples in `flightDebriefChipItems`'s own shape (web-app-wide
 *  interactivity audit v2, web-msm66jlc-gm4oom) — this jargon ("guard
 *  denial", "auto-remediation") needs the same hover/focus explanation
 *  every other digest value already carries. */
export function flightDebriefNotableItems<F>(
  d: FlightDebrief<F>,
): readonly FlightDebriefChipItem[] {
  const items: FlightDebriefChipItem[] = [];
  if (d.guardDenials > 0) {
    const text = d.guardDenials + (d.guardDenials === 1 ? ' guard denial' : ' guard denials');
    items.push([text, 'PreToolUse containment/read-hygiene hits this flight', text]);
  }
  if (d.remediations > 0) {
    const text =
      d.remediations + (d.remediations === 1 ? ' auto-remediation' : ' auto-remediations');
    items.push([text, 'Mechanical RemediatingGate auto-fixes this flight', text]);
  }
  return items;
}
