// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Pure day-bucketing logic for the project page's contribution heatmap —
 * client-only (no server counterpart, unlike `shared/*.ts`), so it lives in
 * `web/` rather than `shared/` (epic 0002 "shell decomposition", slice 2:
 * feature-module split of `shell.ts`), following the same pattern
 * `office-map.ts`/`format.ts` proved. Deliberately DOM-free: the SVG-drawing
 * half (`contributionHeatmap`) stays inline in `fleetJs()`.
 *
 * `heatmapDays` takes verdict classification via a caller-supplied
 * `verdictOf` rather than importing `flightVerdictOf` from `shell.ts` —
 * mirroring the existing `metricSparkline(log, tasks, valueOf, ...)`
 * injection pattern already used elsewhere in the client — so this module
 * stays self-contained and verdict resolution stays the one place it already
 * lived.
 *
 * `heatCellPos` is the grid's own per-cell x/y geometry — previously computed
 * inline in `contributionHeatmap` before building each `<rect>`, moved out
 * the same way `sparkBars`/`officeSatellitePos` were.
 *
 * `heatTip` is the cell's full tooltip/aria-label text (date + `heatLabel`'s
 * tallies) — previously computed inline in `contributionHeatmap` as a bare
 * string concatenation before writing it to each `<rect>`'s `data-tip`/
 * `aria-label`.
 *
 * `web/shell.ts` embeds this module's real compiled source into the
 * generated `/app.js` text via `.toString()` — see `fleetJs()` — instead of
 * hand-retyping it, so the two copies can no longer drift apart.
 */

/** Trailing weeks the grid renders, like a GitHub contribution graph. */
export const HEATMAP_WEEKS = 20;
export const HEATMAP_DAY_MS = 86400000;

/** A flight-log field {@link heatmapDays} reads to bucket it into a calendar day. */
export interface HeatmapLogEntry {
  readonly at: number;
}

/** A full-history per-day tally from the server (store firingDayCounts) —
 *  the truthful source over bucketing a capped flight-log window. */
export interface HeatmapDayCount {
  readonly day: string;
  readonly ships: number;
  readonly deaths: number;
  readonly other: number;
}

/** One rendered calendar cell's tallies. */
export interface HeatmapDay {
  readonly key: string;
  readonly ships: number;
  readonly deaths: number;
  readonly other: number;
}

/** "YYYY-MM-DD" for ts's UTC calendar day — the heatmap's per-cell bucket key. */
export function heatDayKey(ts: number): string {
  const d = new Date(ts);
  const m = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  return d.getUTCFullYear() + '-' + (m < 10 ? '0' + m : m) + '-' + (day < 10 ? '0' + day : day);
}

/** UTC midnight for ts's calendar day — grid math stays in whole days with no
 *  local-timezone/DST drift (Date.UTC has none). */
export function heatDayStart(ts: number): number {
  const d = new Date(ts);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/**
 * Buckets flightLog into one row per calendar day across a trailing
 * `weeks`-week window ending on now's week (Sun-start columns, like GitHub)
 * — a fixed window so the grid always reads the same width regardless of how
 * much history a project has.
 */
export function heatmapDays<T extends HeatmapLogEntry>(
  log: readonly T[],
  now: number,
  weeks: number,
  dayCounts: readonly HeatmapDayCount[] | null | undefined,
  verdictOf: (f: T) => string,
): HeatmapDay[] {
  const end = heatDayStart(now);
  const endDow = new Date(end).getUTCDay(); // 0=Sun..6=Sat
  const gridEnd = end + (6 - endDow) * HEATMAP_DAY_MS; // pad forward to the week's Saturday
  const totalDays = weeks * 7;
  const gridStart = gridEnd - (totalDays - 1) * HEATMAP_DAY_MS; // lands on a Sunday
  const byDay: Record<string, { ships: number; deaths: number; other: number }> = {};
  if (dayCounts && dayCounts.length) {
    // Full-history tallies from the server (store firingDayCounts) — the
    // truthful source. Bucketing the capped 20-row log window painted the
    // busiest days as "no firings" (caught live by the operator).
    for (const dc of dayCounts) {
      byDay[dc.day] = { ships: dc.ships, deaths: dc.deaths, other: dc.other };
    }
  } else {
    for (const f of log) {
      const key = heatDayKey(f.at);
      if (!byDay[key]) byDay[key] = { ships: 0, deaths: 0, other: 0 };
      const v = verdictOf(f);
      if (v === 'shipped') byDay[key].ships++;
      else if (v === 'reverted' || v === 'turn-capped' || v === 'timed-out' || v === 'errored')
        byDay[key].deaths++;
      else byDay[key].other++;
    }
  }
  const days: HeatmapDay[] = [];
  for (let t = gridStart; t <= gridEnd; t += HEATMAP_DAY_MS) {
    if (t > end) continue; // never render FUTURE days (caught live: cells for next week)
    const k = heatDayKey(t);
    const b = byDay[k] || { ships: 0, deaths: 0, other: 0 };
    days.push({ key: k, ships: b.ships, deaths: b.deaths, other: b.other });
  }
  return days;
}

/** The heatmap cell class for a day's tallies — a death wins the color even
 *  if the same day also shipped, so a bad day never hides behind an earlier
 *  good one. */
export function heatClass(day: HeatmapDay): string {
  if (day.deaths > 0) return 'heat-death';
  if (day.ships > 0) return 'heat-ship-' + (day.ships >= 4 ? 4 : day.ships);
  if (day.other > 0) return 'heat-other';
  return 'heat-empty';
}

/** The tooltip/aria-label text for a day's tallies. */
export function heatLabel(day: HeatmapDay): string {
  const parts: string[] = [];
  if (day.ships > 0) parts.push(day.ships + ' shipped');
  if (day.deaths > 0) parts.push(day.deaths + ' died');
  if (day.other > 0) parts.push(day.other + ' other');
  return parts.length ? parts.join(', ') : 'no firings';
}

/** A cell's full `[data-tip]`/`aria-label` text: its calendar date plus {@link heatLabel}'s tallies. */
export function heatTip(day: HeatmapDay): string {
  return day.key + ' — ' + heatLabel(day);
}

/** A grid cell's top-left pixel position, in SVG viewBox units. */
export interface HeatCellPos {
  readonly x: number;
  readonly y: number;
}

/** Pixel position of the i-th calendar-day cell in the heatmap grid —
 *  column-per-week, row-per-weekday (Sun-start, like GitHub's own graph),
 *  matching `heatmapDays`' own row order. */
export function heatCellPos(i: number, cell: number, gap: number, rows = 7): HeatCellPos {
  const week = Math.floor(i / rows);
  const dow = i % rows;
  return { x: week * (cell + gap), y: dow * (cell + gap) };
}
