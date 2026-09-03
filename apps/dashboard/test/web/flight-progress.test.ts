// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Direct unit coverage for the fly bar's TOTAL flight-level progress bar's
 * pure math (`web/flight-progress.ts`) — extracted under epic 0002 "shell
 * decomposition", slice 2, sixteenth cut. `flight-total-progress.test.ts`
 * already regression-tests this logic indirectly through the rendered DOM
 * in `clientJs()`; these tests exercise the real function directly instead.
 */

import { describe, it, expect, vi } from 'vitest';
import { STRINGS } from '@autopilot/tokens';
import {
  flightProgressOf,
  sessionFlightDataFor,
  type FlightProgressTranslator,
} from '../../src/web/flight-progress.js';
import { fmtCost, fmtDuration } from '../../src/web/format.js';
import { averageFiringDurationMs } from '../../src/shared/live-firing.js';

/** The bundle's `tr()` map-form substitution (web/features/locale.ts) over
 *  one locale's table, mirrored so the direct calls below read the same
 *  STRINGS wording the served bundle does (board web-msnsndki-dz3vn1). */
function translatorFor(locale: 'en' | 'he'): FlightProgressTranslator {
  return (key, subs) =>
    Object.keys(subs ?? {}).reduce(
      (t, k) => t.split('{' + k + '}').join(String(subs?.[k])),
      STRINGS[locale][key],
    );
}
const enTr = translatorFor('en');

describe('flightProgressOf', () => {
  it('returns null when the flight carries neither a total budget nor a firing count', () => {
    expect(flightProgressOf({}, [], null, fmtCost, fmtDuration, enTr)).toBeNull();
  });

  it('computes percent/spend/ETA in fixed-firings mode from firings landed this session', () => {
    const result = flightProgressOf(
      { firings: 4 },
      [
        { cost: 2.5, durationMs: 100_000 },
        { cost: 3.5, durationMs: 60_000 },
      ],
      null,
      fmtCost,
      fmtDuration,
      enTr,
    );

    expect(result).not.toBeNull();
    // 2 of 4 firings landed = 50%
    expect(result?.pct).toBe(50);
    expect(result?.progressBit).toBe('2 / 4 firing(s) · $6.00 so far');
    // remaining 2 firings * 80s avg duration = 160s = 2m 40s
    expect(result?.etaBit).toBe(' · ETA ~2m 40s');
  });

  it('computes percent/spend/ETA in total-spend mode against the $ target', () => {
    const result = flightProgressOf(
      { totalBudgetUsd: 30, firings: 20 },
      [
        { cost: 3, durationMs: 60_000 },
        { cost: 3, durationMs: 60_000 },
        { cost: 3, durationMs: 60_000 },
      ],
      null,
      fmtCost,
      fmtDuration,
      enTr,
    );

    // $9 of $30 = 30%
    expect(result?.pct).toBe(30);
    expect(result?.progressBit).toBe('$9.00 of $30 total');
    // avg cost $3/firing, $21 remaining -> 7 more firings * 60s avg = 7m 0s
    expect(result?.etaBit).toBe(' · ETA ~7m 0s');
  });

  it('falls back to the historical average duration before any firing lands this session', () => {
    const result = flightProgressOf({ firings: 4 }, [], 50_000, fmtCost, fmtDuration, enTr);

    expect(result?.pct).toBe(0);
    expect(result?.progressBit).toBe('0 / 4 firing(s) · $0.00 so far');
    // remaining 4 firings * 50s historical avg = 200s = 3m 20s
    expect(result?.etaBit).toBe(' · ETA ~3m 20s');
  });

  it('reports "finishing up" once the target is fully covered by landed firings', () => {
    const result = flightProgressOf(
      { firings: 2 },
      [
        { cost: 1, durationMs: 30_000 },
        { cost: 1, durationMs: 30_000 },
      ],
      null,
      fmtCost,
      fmtDuration,
      enTr,
    );

    expect(result?.pct).toBe(100);
    expect(result?.etaBit).toBe(' · finishing up');
  });

  it('omits the ETA clause when no average duration is known from either source', () => {
    const result = flightProgressOf(
      { firings: 4 },
      [{ cost: 1 }],
      null,
      fmtCost,
      fmtDuration,
      enTr,
    );

    expect(result?.etaBit).toBe('');
  });

  it('composes both clauses through the injected translator, never in English of its own', () => {
    const tr = vi.fn<FlightProgressTranslator>((key) => '<' + key + '>');

    const result = flightProgressOf(
      { firings: 4 },
      [{ cost: 2.5, durationMs: 100_000 }],
      null,
      fmtCost,
      fmtDuration,
      tr,
    );

    expect(result?.progressBit).toBe('<flightProgressFiringsSoFar>');
    expect(result?.etaBit).toBe('<flightProgressEta>');
    expect(tr).toHaveBeenCalledWith('flightProgressFiringsSoFar', {
      done: 1,
      count: 4,
      spent: '$2.50',
    });
    expect(tr).toHaveBeenCalledWith('flightProgressEta', { eta: '5m 0s' });
  });

  it('lands the numbers where the Hebrew table puts them', () => {
    const result = flightProgressOf(
      { totalBudgetUsd: 30 },
      [{ cost: 3, durationMs: 60_000 }],
      null,
      fmtCost,
      fmtDuration,
      translatorFor('he'),
    );

    expect(result?.progressBit).toBe('$3.00 מתוך $30 בסך הכול');
    expect(result?.etaBit).toBe(' · הערכת סיום ~9m 0s');
  });

  it('caps percent at 100 even when spend overshoots the total budget', () => {
    const result = flightProgressOf(
      { totalBudgetUsd: 10 },
      [{ cost: 15, durationMs: 1000 }],
      null,
      fmtCost,
      fmtDuration,
      enTr,
    );

    expect(result?.pct).toBe(100);
  });

  it('prefers the total-budget target over a firing count when both are set', () => {
    const result = flightProgressOf(
      { totalBudgetUsd: 10, firings: 4 },
      [{ cost: 5, durationMs: 1000 }],
      null,
      fmtCost,
      fmtDuration,
      enTr,
    );

    expect(result?.progressBit).toBe('$5.00 of $10 total');
  });
});

describe('sessionFlightDataFor', () => {
  it('returns no session firings and no historical average when no project is flying', () => {
    const result = sessionFlightDataFor(
      [{ status: 'idle', flightLog: [{ at: 1, cost: 1 }] }],
      0,
      averageFiringDurationMs,
    );

    expect(result.sessionFirings).toEqual([]);
    expect(result.historicalAvgDurationMs).toBeNull();
  });

  it('filters the flying project flight log to entries landed since startedAt', () => {
    const result = sessionFlightDataFor(
      [
        { status: 'idle', flightLog: [{ at: 500, cost: 9 }] },
        {
          status: 'flying',
          flightLog: [
            { at: 100, cost: 1, durationMs: 10_000 },
            { at: 200, cost: 2, durationMs: 20_000 },
            { at: 300, cost: 3, durationMs: 30_000 },
          ],
        },
      ],
      200,
      averageFiringDurationMs,
    );

    expect(result.sessionFirings).toEqual([
      { at: 200, cost: 2, durationMs: 20_000 },
      { at: 300, cost: 3, durationMs: 30_000 },
    ]);
    // Historical average is over the flying project's FULL flight log, not just the session slice.
    expect(result.historicalAvgDurationMs).toBe(20_000);
  });

  it('treats a flying project with no flight log as having no firings at all', () => {
    const result = sessionFlightDataFor([{ status: 'flying' }], 0, averageFiringDurationMs);

    expect(result.sessionFirings).toEqual([]);
    expect(result.historicalAvgDurationMs).toBeNull();
  });
});
