// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Pure trend math for the evolution view — "is the agent improving?"
 * (human-vs-agent evaluation, backlog J / web-msniol15-foo6oi, checkbox 5).
 * Buckets the store's `evaluationLabelDayCounts` (served on
 * `ProjectAggregate.evaluationLabelDayCounts`) into trailing Sun-start weeks
 * and derives the approval-rate trend plus the panel's aria-label text.
 *
 * Client-only (no server counterpart, unlike `shared/*.ts`), so it lives in
 * `web/` rather than `shared/` — following the same pattern
 * `heatmap.ts`/`sparkline.ts` proved. Deliberately DOM-free and
 * self-contained (its own tiny UTC-day helpers rather than importing
 * `heatmap.ts`'s), so `web/shell.ts` can embed each function into the
 * generated `/app.js` text via `.toString()` without dragging in another
 * module's symbols.
 *
 * The direction compares the later half of verdict-carrying weeks against
 * the earlier half and refuses to call anything inside a ±5-point band a
 * trend — a single noisy week must not read as "declining" to the operator.
 */

/** Trailing weeks the trend renders — a quarter-ish window, enough to see a
 *  direction without compressing bars below legibility. */
export const EVAL_TREND_WEEKS = 12;
export const EVAL_TREND_DAY_MS = 86400000;
export const EVAL_TREND_WEEK_MS = 7 * EVAL_TREND_DAY_MS;
/** Rate deltas inside this band read as noise, not a trend. */
export const EVAL_TREND_FLAT_BAND = 0.05;

/** One per-day tally from the server (store evaluationLabelDayCounts). */
export interface EvaluationDayCount {
  readonly day: string;
  readonly approved: number;
  readonly rejected: number;
}

/** One rendered week's tallies; `rate` is null when the week carries no
 *  operator verdicts at all (renderers show a gap, not a fake 0%). */
export interface EvaluationTrendWeek {
  readonly key: string;
  readonly approved: number;
  readonly rejected: number;
  readonly rate: number | null;
}

export type EvaluationTrendDirection = 'improving' | 'declining' | 'flat';

/** Whole-window totals plus the half-vs-half direction verdict. */
export interface EvaluationTrendSummary {
  readonly approved: number;
  readonly rejected: number;
  readonly rate: number | null;
  readonly direction: EvaluationTrendDirection | null;
}

/** UTC millis for a store "YYYY-MM-DD" day key. */
export function evalDayTs(day: string): number {
  const parts = day.split('-');
  return Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
}

/** "YYYY-MM-DD" for ts's UTC calendar day — the week's Sunday key. */
export function evalDayKey(ts: number): string {
  const d = new Date(ts);
  const m = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  return d.getUTCFullYear() + '-' + (m < 10 ? '0' + m : m) + '-' + (day < 10 ? '0' + day : day);
}

/** UTC midnight of the Sunday starting ts's week (Sun-start, like the
 *  contribution heatmap's grid). */
export function evalWeekStart(ts: number): number {
  const d = new Date(ts);
  const dayStart = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return dayStart - new Date(dayStart).getUTCDay() * EVAL_TREND_DAY_MS;
}

/**
 * Buckets per-day verdict tallies into a fixed trailing `weeks`-week window
 * ending on now's week — fixed so the chart always reads the same width
 * regardless of history, mirroring `heatmapDays`. Days outside the window
 * are dropped; verdict-free weeks stay in the output with a null rate.
 */
export function evaluationTrendWeeks(
  dayCounts: readonly EvaluationDayCount[] | null | undefined,
  now: number,
  weeks = EVAL_TREND_WEEKS,
): EvaluationTrendWeek[] {
  const lastWeekStart = evalWeekStart(now);
  const firstWeekStart = lastWeekStart - (weeks - 1) * EVAL_TREND_WEEK_MS;
  const approved: number[] = [];
  const rejected: number[] = [];
  for (let i = 0; i < weeks; i++) {
    approved.push(0);
    rejected.push(0);
  }
  for (const dc of dayCounts || []) {
    const week = Math.floor((evalDayTs(dc.day) - firstWeekStart) / EVAL_TREND_WEEK_MS);
    if (week < 0 || week >= weeks) continue;
    approved[week] = (approved[week] || 0) + dc.approved;
    rejected[week] = (rejected[week] || 0) + dc.rejected;
  }
  const out: EvaluationTrendWeek[] = [];
  for (let i = 0; i < weeks; i++) {
    const a = approved[i] || 0;
    const r = rejected[i] || 0;
    out.push({
      key: evalDayKey(firstWeekStart + i * EVAL_TREND_WEEK_MS),
      approved: a,
      rejected: r,
      rate: a + r > 0 ? a / (a + r) : null,
    });
  }
  return out;
}

/** Totals the window and calls the direction: later half of verdict-carrying
 *  weeks vs the earlier half, mean weekly rate, ±{@link EVAL_TREND_FLAT_BAND}
 *  dead band. Fewer than two weeks with data → no direction claim at all. */
export function evaluationTrendSummary(
  weeks: readonly EvaluationTrendWeek[],
): EvaluationTrendSummary {
  let approved = 0;
  let rejected = 0;
  const rates: number[] = [];
  for (const w of weeks) {
    approved += w.approved;
    rejected += w.rejected;
    if (w.rate !== null) rates.push(w.rate);
  }
  const rate = approved + rejected > 0 ? approved / (approved + rejected) : null;
  let direction: EvaluationTrendDirection | null = null;
  if (rates.length >= 2) {
    const mid = Math.floor(rates.length / 2);
    const mean = (xs: readonly number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
    const delta = mean(rates.slice(mid)) - mean(rates.slice(0, mid));
    direction =
      delta > EVAL_TREND_FLAT_BAND
        ? 'improving'
        : delta < -EVAL_TREND_FLAT_BAND
          ? 'declining'
          : 'flat';
  }
  return { approved, rejected, rate, direction };
}

/** One bar's tooltip/aria-label text; callers skip verdict-free weeks
 *  (they render as gaps, so there is no bar to label). */
export function evaluationTrendWeekTip(week: EvaluationTrendWeek): string {
  return (
    'week of ' +
    week.key +
    ': ' +
    week.approved +
    ' approved, ' +
    week.rejected +
    ' rejected — ' +
    Math.round((week.rate || 0) * 100) +
    '% approval'
  );
}

/** The panel's tooltip/aria-label text for a window summary. */
export function evaluationTrendLabel(summary: EvaluationTrendSummary): string {
  if (summary.rate === null) return 'no operator verdicts yet';
  const directionWord =
    summary.direction === null
      ? ''
      : ', ' + (summary.direction === 'flat' ? 'steady' : summary.direction);
  return (
    summary.approved +
    ' approved, ' +
    summary.rejected +
    ' rejected — ' +
    Math.round(summary.rate * 100) +
    '% approval' +
    directionWord
  );
}
