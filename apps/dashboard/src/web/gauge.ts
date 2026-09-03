// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Pure severity-gauge segment math for the fleet card's findings gauge —
 * client-only (no server counterpart, unlike `shared/*.ts`), so it lives in
 * `web/` rather than `shared/` (epic 0002 "shell decomposition", slice 2:
 * feature-module split of `shell.ts`), following the same pattern
 * `lang-bar.ts`/`flight-metrics.ts`/`heatmap.ts` proved.
 *
 * `web/shell.ts` embeds this module's real compiled source into the
 * generated `/app.js` text via `.toString()` — see `fleetJs()` — instead of
 * hand-retyping it, so the two copies can no longer drift apart.
 */

/** {@link cardGaugeLabels}'s result: the fleet card's two gauge-label spans. */
export interface CardGaugeLabels {
  readonly findingsText: string;
  readonly activityText: string;
}

/** Open-findings counts by severity, as read by {@link gaugeSegments}. */
export interface GaugeCounts {
  readonly critical: number;
  readonly high: number;
  readonly medium: number;
  readonly low: number;
}

/** One drawable segment of the severity gauge: its severity kind, its share
 *  of the bar (equal to its raw count — segments render at `flex: count`),
 *  and the count itself for the tooltip/label. */
export interface GaugeSegment {
  readonly kind: 'critical' | 'high' | 'medium' | 'low';
  readonly count: number;
}

/** {@link gaugeSegmentMeta}'s result: one segment's hover/focus tip and
 *  aria-label text. */
export interface GaugeSegmentMeta {
  readonly tip: string;
  readonly ariaLabel: string;
}

/** Turns a project's open-findings counts into drawable gauge segments,
 *  critical-to-low, dropping any severity with a zero count. Returns an
 *  empty array when every severity is zero (no open findings at all), so
 *  callers can render the single "all clear" segment instead of a bar. */
export function gaugeSegments(g: GaugeCounts): readonly GaugeSegment[] {
  const order: readonly (keyof GaugeCounts)[] = ['critical', 'high', 'medium', 'low'];
  const segments: GaugeSegment[] = [];
  for (const kind of order) {
    const count = g[kind];
    if (count > 0) segments.push({ kind, count });
  }
  return segments;
}

/** The fleet card's gauge-label text — the pluralized "N open finding(s)"
 *  count and the "last activity" timestamp (or its "no activity yet"
 *  fallback) shown above the severity gauge. Takes `fmtAgo` via injection
 *  rather than importing it from `./format.ts`, the same
 *  `flightProgressOf`/`actMeta` pattern every other cut in this epic uses,
 *  since a real cross-module import breaks once Vitest's SSR transform
 *  rewrites it to a reference that doesn't survive `.toString()`
 *  extraction. */
export function cardGaugeLabels(
  c: { readonly openFindings: number; readonly lastActivityAt: number | null },
  fmtAgo: (ts: number) => string,
): CardGaugeLabels {
  const findingsText = c.openFindings + (c.openFindings === 1 ? ' open finding' : ' open findings');
  const activityText = c.lastActivityAt ? fmtAgo(c.lastActivityAt) : 'no activity yet';
  return { findingsText, activityText };
}

/** One severity-gauge segment's hover/focus tip ("N &lt;kind&gt;", e.g.
 *  "2 high") and aria-label ("&lt;kind&gt;: N") — the text every segment
 *  `<span>` in the bar carries, distinct from the all-clear segment's static
 *  "No open findings" copy which stays inline since it has no per-segment
 *  data to format. */
export function gaugeSegmentMeta(seg: GaugeSegment): GaugeSegmentMeta {
  return {
    tip: seg.count + ' ' + seg.kind,
    ariaLabel: seg.kind + ': ' + seg.count,
  };
}
