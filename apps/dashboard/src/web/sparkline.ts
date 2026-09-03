// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Pure per-bar geometry math shared by every metric sparkline (cost, fleet
 * ship form, turns, cache-read share, ...) — client-only (no server
 * counterpart, unlike `shared/*.ts`), so it lives in `web/` rather than
 * `shared/` (epic 0002 "shell decomposition", slice 2: feature-module split
 * of `shell.ts`), following the same pattern `gauge.ts`/`lang-bar.ts` proved.
 *
 * `web/shell.ts` embeds this module's real compiled source into the
 * generated `/app.js` text via `.toString()` — see `fleetJs()` — instead of
 * hand-retyping it, so the two copies can no longer drift apart.
 */

/** One drawable bar of a sparkline, in SVG viewBox units. */
export interface SparkBar {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** A sparkline's per-bar geometry plus the aggregate values (max, total)
 *  callers need for the whole-chart aria-label. */
export interface SparkGeometry {
  readonly max: number;
  readonly total: number;
  readonly bars: readonly SparkBar[];
}

/** Turns a series of per-firing values into equal-width, height-encoded
 *  bars (tallest bar = the series max, floored at 1 unit tall so a
 *  non-zero value never renders invisibly thin). `max`/`total` are always
 *  computed even when every value is zero, so callers can decide whether
 *  there is real data to show (mirrors `langBarSegments`'s "return the
 *  aggregate, let the caller gate on it" shape). */
export function sparkBars(
  values: readonly number[],
  width = 240,
  height = 34,
  gap = 2,
): SparkGeometry {
  const n = values.length;
  let max = 0;
  let total = 0;
  for (const v of values) {
    const value = v || 0;
    max = Math.max(max, value);
    total += value;
  }
  const barWidth = n > 0 ? (width - gap * (n - 1)) / n : 0;
  const bars: SparkBar[] = [];
  for (let i = 0; i < n; i++) {
    const barHeight = max > 0 ? Math.max(1, ((values[i] || 0) / max) * (height - 2)) : 0;
    bars.push({
      x: i * (barWidth + gap),
      y: height - barHeight,
      width: barWidth,
      height: barHeight,
    });
  }
  return { max, total, bars };
}
