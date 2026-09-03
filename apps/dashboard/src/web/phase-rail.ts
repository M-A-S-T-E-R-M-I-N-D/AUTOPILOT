// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Pure per-phase activity math for the fleet card's phase rail —
 * client-only (no server counterpart, unlike `shared/*.ts`), so it lives in
 * `web/` rather than `shared/` (epic 0002 "shell decomposition", slice 2:
 * feature-module split of `shell.ts`), following the same pattern
 * `lang-bar.ts`/`gauge.ts`/`flight-metrics.ts` proved. `phaseCounts` feeds
 * the rail's segment tallies; `phaseTipText` feeds each segment's tip/
 * aria-label text; `phaseDetailRows` feeds the "look INTO a phase" detail
 * view a segment expands into.
 *
 * `web/shell.ts` embeds this module's real compiled source into the
 * generated `/app.js` text via `.toString()` — see `fleetJs()` — instead of
 * hand-retyping it, so the two copies can no longer drift apart.
 */

/** The one field {@link phaseCounts}/{@link phaseDetailRows} read off each activity entry. */
export interface PhaseRailActivity {
  readonly phase: string;
}

/** Per-phase activity counts for the ORIENT/DO/GATE/COMMIT phase rail — an
 *  activity with a missing/empty phase counts as `other`; an activity with
 *  some OTHER non-empty phase string counts under its own name (the rail
 *  itself only ever renders segments for the four known phases, so such a
 *  count just sits unused rather than getting merged into `other`). */
export function phaseCounts(acts: readonly PhaseRailActivity[]): Record<string, number> {
  const counts: Record<string, number> = { orient: 0, do: 0, gate: 0, commit: 0, other: 0 };
  for (const act of acts) {
    const p = act.phase || 'other';
    counts[p] = (counts[p] ?? 0) + 1;
  }
  return counts;
}

/** The phase-rail segment's tip/aria-label text (the same string reused for
 *  both attributes) — the `OFFICE_TIPS` explanation for the phase, plus its
 *  activity count. Takes `officeTips` via injection rather than importing
 *  `OFFICE_TIPS` from `web/office-map.ts`, the same `liveWorkerChipMeta`/
 *  `heatmapDays` pattern this module's siblings use to stay import-free
 *  (these modules get spliced into the client bundle via `.toString()`). */
export function phaseTipText(
  phase: string,
  count: number,
  officeTips: Readonly<Record<string, string>>,
): string {
  return (
    officeTips[phase] +
    ' — ' +
    count +
    (count === 1 ? ' activity' : ' activities') +
    ', toggle detail'
  );
}

export const PHASE_DETAIL_CAP = 20;

/** The activities for ONE phase — the "look INTO orient/do/gate/commit" view
 *  a phase-rail segment expands into. Scans newest-first (the caller's
 *  `acts` array is oldest-first) and stops once `cap` rows are collected, the
 *  same missing/empty-as-`other` bucketing {@link phaseCounts} uses. */
export function phaseDetailRows<T extends PhaseRailActivity>(
  acts: readonly T[],
  phase: string,
  cap: number = PHASE_DETAIL_CAP,
): readonly T[] {
  const rows: T[] = [];
  for (let i = acts.length - 1; i >= 0 && rows.length < cap; i--) {
    const act = acts[i];
    if (act === undefined) continue;
    const p = act.phase || 'other';
    if (p === phase) rows.push(act);
  }
  return rows;
}
