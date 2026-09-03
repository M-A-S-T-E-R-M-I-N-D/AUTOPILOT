// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * cockpit-metrics-interaction — the pure math behind the interaction-latency (INP p75
 * proxy) and longest-task axes of `scripts/cockpit-metrics.mjs` (COCKPIT PHASE 0 MEASURE,
 * docs/epics/0015-cockpit-supervisory-control.md, board web-mtettazc-y05162). The DOM
 * side (rendering fixtures, dispatching clicks, timing ticks) lives in the main script
 * next to its shared jsdom harness; everything unit-testable without a DOM lives here,
 * mirroring how `scripts/codemod/split-top-level-regions.mjs` splits logic out for
 * `apps/dashboard/test/tooling/` to import directly.
 */

/**
 * Nearest-rank percentile (CWV tooling's conventional method for small samples): the
 * value at rank `ceil(p/100 * n)` of the ascending-sorted sample, 1-indexed — so p=100
 * is the max and any p low enough to rank 0 clamps to the min. Returns 0 for an empty
 * sample (a render with no interactive elements has no latency to report). The input
 * array is never mutated.
 *
 * @param {number[]} values
 * @param {number} p percentile in [0, 100]
 * @returns {number}
 */
export function percentile(values, p) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((x, y) => x - y);
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.max(0, rank - 1)];
}

/**
 * Folds one rendered fixture's raw timings into the two reported axes:
 *
 * - `inpP75` / `inpMax` — nearest-rank p75 and max of the synchronous event-dispatch
 *   processing durations, one simulated click per tab-stop element. A PROXY for field
 *   INP: jsdom has no paint, so of INP's three components (input delay, processing
 *   duration, presentation delay) only processing duration exists here.
 * - `longestTask` — the longest uninterrupted main-thread block observed anywhere in
 *   the render's lifecycle: the client bundle's initial synchronous eval (`evalMs`),
 *   any poll tick drained through its microtask render continuations (`tickDrains`),
 *   or the slowest single interaction dispatch.
 *
 * @param {{ evalMs: number, tickDrains: number[], durations: number[] }} timings
 * @returns {{ interactions: number, inpP75: number, inpMax: number,
 *             evalMs: number, maxTickMs: number, longestTask: number }}
 */
export function summarizeInteractionTiming({ evalMs, tickDrains, durations }) {
  const inpMax = durations.length > 0 ? Math.max(...durations) : 0;
  const maxTickMs = tickDrains.length > 0 ? Math.max(...tickDrains) : 0;
  return {
    interactions: durations.length,
    inpP75: percentile(durations, 75),
    inpMax,
    evalMs,
    maxTickMs,
    longestTask: Math.max(evalMs, maxTickMs, inpMax),
  };
}
