// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Pure per-language segment math for the fleet card's language bar —
 * client-only (no server counterpart, unlike `shared/*.ts`), so it lives in
 * `web/` rather than `shared/` (epic 0002 "shell decomposition", slice 2:
 * feature-module split of `shell.ts`), following the same pattern
 * `flight-metrics.ts`/`card-sections.ts`/`heatmap.ts` proved.
 *
 * `web/shell.ts` embeds this module's real compiled source into the
 * generated `/app.js` text via `.toString()` — see `fleetJs()` — instead of
 * hand-retyping it, so the two copies can no longer drift apart.
 */

/** One language's byte share, as read by {@link langBarSegments}. */
export interface LangBarLanguage {
  readonly language: string;
  readonly bytes: number | null | undefined;
}

/** One drawable segment of the language bar: its flex share, dimmed-by-rank
 *  opacity, and the percentage its tooltip/label report. */
export interface LangBarSegment {
  readonly language: string;
  readonly bytes: number;
  readonly pct: number;
  readonly opacity: number;
}

/** Turns a project's raw per-language byte counts into drawable segments —
 *  zero-byte languages are dropped, and each segment's opacity dims by its
 *  ORIGINAL rank (not its position among the kept segments), so the bar
 *  still reads "biggest to smallest" even after zero-byte gaps are closed.
 *  Returns an empty array when every language is zero bytes (or the total
 *  is non-positive), so callers can render nothing instead of an empty bar. */
export function langBarSegments(langs: readonly LangBarLanguage[]): readonly LangBarSegment[] {
  let total = 0;
  for (const lang of langs) total += lang.bytes || 0;
  if (total <= 0) return [];
  const segments: LangBarSegment[] = [];
  for (const [i, lang] of langs.entries()) {
    const bytes = lang.bytes || 0;
    if (!bytes) continue;
    segments.push({
      language: lang.language,
      bytes,
      pct: Math.round((bytes / total) * 100),
      opacity: Math.max(0.35, 1 - i * 0.18),
    });
  }
  return segments;
}

/** {@link langSegMeta}'s result: one language-bar segment's hover/focus tip
 *  and aria-label text. */
export interface LangBarSegmentMeta {
  readonly tip: string;
  readonly ariaLabel: string;
}

/** One language's row in the Languages panel's plain-text legend below the
 *  bar, as read by {@link langLegendLine}. */
export interface LangBarLegendEntry {
  readonly language: string;
  readonly files: number;
  readonly bytes: number | null | undefined;
}

/** One language-bar segment's hover/focus tip ("typescript — 75%") and
 *  aria-label ("typescript: 75 percent, 3.0 KB") — the text every segment
 *  `<span>` in the bar carries. Takes `fmtBytes` via injection rather than
 *  importing it from `./format.ts`, the same `cardGaugeLabels`/`actMeta`
 *  pattern every other cut in this epic uses, since a real cross-module
 *  import breaks once Vitest's SSR transform rewrites it to a reference that
 *  doesn't survive `.toString()` extraction. */
export function langSegMeta(
  seg: LangBarSegment,
  fmtBytes: (n: number) => string,
): LangBarSegmentMeta {
  return {
    tip: seg.language + ' — ' + seg.pct + '%',
    ariaLabel: seg.language + ': ' + seg.pct + ' percent, ' + fmtBytes(seg.bytes),
  };
}

/** One legend `<li>`'s text below the language bar ("typescript — 12 files,
 *  3.0 KB"). Takes `fmtBytes` via injection, the same pattern
 *  {@link langSegMeta} uses. */
export function langLegendLine(entry: LangBarLegendEntry, fmtBytes: (n: number) => string): string {
  return entry.language + ' — ' + entry.files + ' files, ' + fmtBytes(entry.bytes || 0);
}
