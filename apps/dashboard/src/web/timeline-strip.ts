// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Pure width-encoded segment math for the FLIGHT TIMELINE strip — unlike
 * `sparkline.ts`'s `sparkBars` (equal-width bars, height encodes a value),
 * here every segment is the same height and WIDTH encodes a firing's
 * relative duration, so this is a distinct shape rather than a `sparkBars`
 * caller. Client-only (no server counterpart, unlike `shared/*.ts`), so it
 * lives in `web/` rather than `shared/` (epic 0002 "shell decomposition",
 * slice 2: feature-module split of `shell.ts`), following the same pattern
 * `gauge.ts`/`lang-bar.ts`/`sparkline.ts` proved.
 *
 * `web/shell.ts` embeds this module's real compiled source into the
 * generated `/app.js` text via `.toString()` — see `fleetJs()` — instead of
 * hand-retyping it, so the two copies can no longer drift apart.
 */

/** One drawable segment of the timeline strip, in SVG viewBox units
 *  (x/width only — every segment shares the strip's fixed height). */
export interface TimelineSegment {
  readonly x: number;
  readonly width: number;
}

/** The timeline strip's per-segment geometry plus the summed duration the
 *  whole-chart aria-label needs. */
export interface TimelineGeometry {
  readonly total: number;
  readonly segments: readonly TimelineSegment[];
}

/** Turns a series of per-firing durations into left-to-right segments whose
 *  widths sum to `width` and are proportional to each firing's share of the
 *  total duration. A firing missing `durationMs` (predates that column)
 *  floors to a 1ms-equivalent share rather than vanishing. Returns `null`
 *  for an empty series or when no firing has any real duration data, so the
 *  caller can skip rendering rather than fake a timeline. */
export function timelineSegments(
  durationsMs: readonly (number | null | undefined)[],
  width = 240,
): TimelineGeometry | null {
  const n = durationsMs.length;
  if (n === 0) return null;
  if (!durationsMs.some((d) => !!d)) return null;
  const floored = durationsMs.map((d) => Math.max(1, d || 0));
  let total = 0;
  for (const d of floored) total += d;
  const segments: TimelineSegment[] = [];
  let x = 0;
  for (const d of floored) {
    const w = (d / total) * width;
    segments.push({ x, width: w });
    x += w;
  }
  return { total, segments };
}
