// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Direct unit coverage for the contribution heatmap's pure day-bucketing
 * logic (`web/heatmap.ts`) — extracted under epic 0002 "shell decomposition",
 * slice 2. `contribution-heatmap.test.ts` already regression-tests this
 * logic indirectly through the rendered SVG in `clientJs()`; these tests
 * exercise the real functions directly instead of parsing DOM output.
 */

import { describe, it, expect } from 'vitest';
import {
  HEATMAP_WEEKS,
  HEATMAP_DAY_MS,
  heatDayKey,
  heatDayStart,
  heatmapDays,
  heatClass,
  heatLabel,
  heatCellPos,
  heatTip,
} from '../../src/web/heatmap.js';

const NOW = Date.UTC(2026, 7, 12, 15, 30, 0); // Wed 2026-08-12 15:30 UTC

function verdictOf(f: { verdict: string }): string {
  return f.verdict;
}

describe('heatDayKey', () => {
  it('formats as zero-padded YYYY-MM-DD in UTC', () => {
    expect(heatDayKey(Date.UTC(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });
});

describe('heatDayStart', () => {
  it('returns UTC midnight for the given timestamp, regardless of time of day', () => {
    expect(heatDayStart(NOW)).toBe(Date.UTC(2026, 7, 12, 0, 0, 0));
  });
});

describe('heatmapDays', () => {
  it('never renders a day past "now", even inside the trailing week', () => {
    const days = heatmapDays([], NOW, HEATMAP_WEEKS, null, verdictOf);
    const keys = days.map((d) => d.key);
    expect(keys).toContain('2026-08-12');
    expect(keys).not.toContain('2026-08-13');
    expect(days.length).toBe(HEATMAP_WEEKS * 7 - 3); // Thu/Fri/Sat of the final week are future
  });

  it('buckets log entries into their UTC calendar day by verdict', () => {
    const day = Date.UTC(2026, 7, 10, 9, 0, 0);
    const days = heatmapDays(
      [
        { at: day, verdict: 'shipped' },
        { at: day, verdict: 'reverted' },
      ],
      NOW,
      HEATMAP_WEEKS,
      null,
      verdictOf,
    );
    const cell = days.find((d) => d.key === '2026-08-10')!;
    expect(cell.ships).toBe(1);
    expect(cell.deaths).toBe(1);
  });

  it('treats turn-capped and errored verdicts as deaths, same as reverted', () => {
    const day = Date.UTC(2026, 7, 9, 9, 0, 0);
    const days = heatmapDays(
      [
        { at: day, verdict: 'turn-capped' },
        { at: day, verdict: 'errored' },
      ],
      NOW,
      HEATMAP_WEEKS,
      null,
      verdictOf,
    );
    expect(days.find((d) => d.key === '2026-08-09')!.deaths).toBe(2);
  });

  it('buckets any other verdict as "other"', () => {
    const day = Date.UTC(2026, 7, 8, 9, 0, 0);
    const days = heatmapDays(
      [{ at: day, verdict: 'checkpointed' }],
      NOW,
      HEATMAP_WEEKS,
      null,
      verdictOf,
    );
    expect(days.find((d) => d.key === '2026-08-08')!.other).toBe(1);
  });

  it('prefers full-history dayCounts over bucketing the (possibly capped) log', () => {
    const days = heatmapDays(
      [{ at: Date.UTC(2026, 7, 12), verdict: 'shipped' }],
      NOW,
      HEATMAP_WEEKS,
      [{ day: '2026-08-07', ships: 19, deaths: 1, other: 0 }],
      verdictOf,
    );
    const busy = days.find((d) => d.key === '2026-08-07')!;
    expect(busy.ships).toBe(19);
    expect(busy.deaths).toBe(1);
    // The log-only entry on 08-12 is NOT bucketed — dayCounts wins wholesale.
    expect(days.find((d) => d.key === '2026-08-12')!.ships).toBe(0);
  });

  it('defaults an unbucketed day to all-zero tallies', () => {
    const days = heatmapDays([], NOW, HEATMAP_WEEKS, null, verdictOf);
    expect(days.find((d) => d.key === '2026-08-01')).toEqual({
      key: '2026-08-01',
      ships: 0,
      deaths: 0,
      other: 0,
    });
  });

  it('spans exactly weeks*7 days worth of grid, minus any trailing future days', () => {
    const days = heatmapDays([], NOW, 4, null, verdictOf);
    expect(days.length).toBeLessThanOrEqual(4 * 7);
    expect(days.length).toBeGreaterThan(4 * 7 - 7);
  });

  it('renders an empty grid for an explicit weeks=0, instead of silently substituting the default', () => {
    const days = heatmapDays([], NOW, 0, null, verdictOf);
    expect(days).toEqual([]);
  });
});

describe('heatClass', () => {
  it('colors a death red even when the same day also shipped', () => {
    expect(heatClass({ key: 'k', ships: 3, deaths: 1, other: 0 })).toBe('heat-death');
  });

  it('scales ship-day green intensity with count, capped at 4', () => {
    expect(heatClass({ key: 'k', ships: 1, deaths: 0, other: 0 })).toBe('heat-ship-1');
    expect(heatClass({ key: 'k', ships: 4, deaths: 0, other: 0 })).toBe('heat-ship-4');
    expect(heatClass({ key: 'k', ships: 9, deaths: 0, other: 0 })).toBe('heat-ship-4');
  });

  it('grays a day with only non-ship, non-death activity', () => {
    expect(heatClass({ key: 'k', ships: 0, deaths: 0, other: 2 })).toBe('heat-other');
  });

  it('marks a day with nothing at all as empty', () => {
    expect(heatClass({ key: 'k', ships: 0, deaths: 0, other: 0 })).toBe('heat-empty');
  });
});

describe('heatLabel', () => {
  it('joins all non-zero tallies into one label', () => {
    expect(heatLabel({ key: 'k', ships: 1, deaths: 1, other: 1 })).toBe(
      '1 shipped, 1 died, 1 other',
    );
  });

  it('reports "no firings" for an all-zero day', () => {
    expect(heatLabel({ key: 'k', ships: 0, deaths: 0, other: 0 })).toBe('no firings');
  });
});

describe('heatTip', () => {
  it('joins the calendar date and the tally label with an em dash', () => {
    expect(heatTip({ key: '2026-08-01', ships: 1, deaths: 1, other: 1 })).toBe(
      '2026-08-01 — 1 shipped, 1 died, 1 other',
    );
  });

  it('falls back to "no firings" for an all-zero day', () => {
    expect(heatTip({ key: '2026-08-01', ships: 0, deaths: 0, other: 0 })).toBe(
      '2026-08-01 — no firings',
    );
  });
});

describe('HEATMAP_DAY_MS', () => {
  it('is exactly one day in milliseconds', () => {
    expect(HEATMAP_DAY_MS).toBe(24 * 60 * 60 * 1000);
  });
});

describe('heatCellPos', () => {
  it('places the first cell of each week at x=0, top row at y=0', () => {
    expect(heatCellPos(0, 11, 3, 7)).toEqual({ x: 0, y: 0 });
  });

  it('walks down the column (increasing y) for the first 7 cells (one week)', () => {
    expect(heatCellPos(1, 11, 3, 7)).toEqual({ x: 0, y: 14 });
    expect(heatCellPos(6, 11, 3, 7)).toEqual({ x: 0, y: 84 });
  });

  it('advances to the next column (increasing x) once a week of rows is filled', () => {
    expect(heatCellPos(7, 11, 3, 7)).toEqual({ x: 14, y: 0 });
    expect(heatCellPos(8, 11, 3, 7)).toEqual({ x: 14, y: 14 });
  });

  it('spaces columns/rows by cell size plus gap', () => {
    expect(heatCellPos(14, 20, 5, 7)).toEqual({ x: 50, y: 0 });
  });

  it('defaults to 7 rows (Sun-start week) when rows is omitted', () => {
    expect(heatCellPos(7, 11, 3)).toEqual({ x: 14, y: 0 });
  });
});
