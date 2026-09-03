// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Direct unit coverage for the pure evolution-view trend math
 * (`web/evaluation-trend.ts`) — the human-vs-agent evaluation's "is the agent
 * improving?" panel (backlog J / web-msniol15-foo6oi, checkbox 5). Buckets
 * the store's `evaluationLabelDayCounts` (served on
 * `ProjectAggregate.evaluationLabelDayCounts`) into trailing Sun-start weeks
 * and derives the approval-rate trend an operator reads at a glance.
 */

import { describe, it, expect } from 'vitest';
import {
  evaluationTrendWeeks,
  evaluationTrendSummary,
  evaluationTrendLabel,
  evalDayTs,
  evalDayKey,
  evalWeekStart,
  EVAL_TREND_WEEKS,
} from '../../src/web/evaluation-trend.js';

const NOW = Date.UTC(2026, 7, 12, 12, 0, 0); // Wed 2026-08-12 12:00 UTC

describe('evalDayTs', () => {
  it('parses a store day key into UTC midnight millis', () => {
    expect(evalDayTs('2026-08-12')).toBe(Date.UTC(2026, 7, 12));
  });

  it('round-trips across a UTC year boundary', () => {
    expect(evalDayTs('2025-12-31')).toBe(Date.UTC(2025, 11, 31));
    expect(evalDayTs('2026-01-01')).toBe(Date.UTC(2026, 0, 1));
  });
});

describe('evalDayKey', () => {
  it('formats a UTC timestamp back into a zero-padded day key', () => {
    expect(evalDayKey(Date.UTC(2026, 7, 3))).toBe('2026-08-03');
  });

  it('pads single-digit months and days', () => {
    expect(evalDayKey(Date.UTC(2026, 0, 5))).toBe('2026-01-05');
  });

  it('is the inverse of evalDayTs for a round trip', () => {
    expect(evalDayKey(evalDayTs('2026-08-12'))).toBe('2026-08-12');
  });
});

describe('evalWeekStart', () => {
  it('returns the same UTC midnight when ts already falls on a Sunday', () => {
    const sunday = Date.UTC(2026, 7, 9); // 2026-08-09 is a Sunday
    expect(evalWeekStart(sunday)).toBe(sunday);
  });

  it("walks a mid-week timestamp back to that week's Sunday", () => {
    const wednesday = Date.UTC(2026, 7, 12, 15, 30); // Wed, with a time-of-day component
    expect(evalWeekStart(wednesday)).toBe(Date.UTC(2026, 7, 9));
  });

  it('walks back across a UTC month/year rollover', () => {
    const thursday = Date.UTC(2026, 0, 1); // 2026-01-01 is a Thursday
    expect(evalWeekStart(thursday)).toBe(Date.UTC(2025, 11, 28)); // preceding Sunday
  });
});

describe('evaluationTrendWeeks', () => {
  it('buckets day counts into Sun-start weeks keyed by the Sunday date', () => {
    const weeks = evaluationTrendWeeks(
      [
        { day: '2026-08-03', approved: 2, rejected: 1 }, // Mon of week 2026-08-02
        { day: '2026-08-10', approved: 1, rejected: 0 }, // Mon of week 2026-08-09
      ],
      NOW,
      2,
    );
    expect(weeks).toEqual([
      { key: '2026-08-02', approved: 2, rejected: 1, rate: 2 / 3 },
      { key: '2026-08-09', approved: 1, rejected: 0, rate: 1 },
    ]);
  });

  it('sums multiple days landing in the same week', () => {
    const weeks = evaluationTrendWeeks(
      [
        { day: '2026-08-09', approved: 1, rejected: 0 }, // Sun
        { day: '2026-08-12', approved: 0, rejected: 2 }, // Wed, same week
      ],
      NOW,
      1,
    );
    expect(weeks).toEqual([{ key: '2026-08-09', approved: 1, rejected: 2, rate: 1 / 3 }]);
  });

  it('always renders the fixed window: verdict-free weeks appear with a null rate', () => {
    const weeks = evaluationTrendWeeks([{ day: '2026-08-10', approved: 1, rejected: 0 }], NOW, 3);
    expect(weeks.map((w) => w.key)).toEqual(['2026-07-26', '2026-08-02', '2026-08-09']);
    expect(weeks[0]).toEqual({ key: '2026-07-26', approved: 0, rejected: 0, rate: null });
    expect(weeks[1]!.rate).toBeNull();
  });

  it('drops days outside the trailing window instead of crashing or mis-bucketing', () => {
    const weeks = evaluationTrendWeeks(
      [
        { day: '2025-08-10', approved: 9, rejected: 9 }, // a year old
        { day: '2026-08-10', approved: 1, rejected: 0 },
      ],
      NOW,
      2,
    );
    expect(weeks.map((w) => w.approved)).toEqual([0, 1]);
  });

  it('renders an all-null window when the server sent no counts at all', () => {
    for (const counts of [null, undefined, []] as const) {
      const weeks = evaluationTrendWeeks(counts, NOW, 2);
      expect(weeks).toHaveLength(2);
      expect(weeks.every((w) => w.rate === null)).toBe(true);
    }
  });

  it('defaults to the EVAL_TREND_WEEKS window width', () => {
    expect(evaluationTrendWeeks([], NOW)).toHaveLength(EVAL_TREND_WEEKS);
  });
});

describe('evaluationTrendSummary', () => {
  it('totals verdicts across the window and computes the overall approval rate', () => {
    const summary = evaluationTrendSummary(
      evaluationTrendWeeks(
        [
          { day: '2026-08-03', approved: 3, rejected: 1 },
          { day: '2026-08-10', approved: 1, rejected: 0 },
        ],
        NOW,
        2,
      ),
    );
    expect(summary.approved).toBe(4);
    expect(summary.rejected).toBe(1);
    expect(summary.rate).toBe(4 / 5);
  });

  it('reads improving when later weeks approve at a clearly higher rate', () => {
    const summary = evaluationTrendSummary(
      evaluationTrendWeeks(
        [
          { day: '2026-08-03', approved: 1, rejected: 3 }, // 25%
          { day: '2026-08-10', approved: 3, rejected: 1 }, // 75%
        ],
        NOW,
        2,
      ),
    );
    expect(summary.direction).toBe('improving');
  });

  it('reads declining when later weeks approve at a clearly lower rate', () => {
    const summary = evaluationTrendSummary(
      evaluationTrendWeeks(
        [
          { day: '2026-08-03', approved: 3, rejected: 1 },
          { day: '2026-08-10', approved: 1, rejected: 3 },
        ],
        NOW,
        2,
      ),
    );
    expect(summary.direction).toBe('declining');
  });

  it('reads flat inside the ±5-point band so noise never claims a trend', () => {
    const summary = evaluationTrendSummary(
      evaluationTrendWeeks(
        [
          { day: '2026-08-03', approved: 76, rejected: 24 }, // 76%
          { day: '2026-08-10', approved: 3, rejected: 1 }, // 75%
        ],
        NOW,
        2,
      ),
    );
    expect(summary.direction).toBe('flat');
  });

  it('skips verdict-free weeks when splitting halves for the direction', () => {
    const summary = evaluationTrendSummary(
      evaluationTrendWeeks(
        [
          { day: '2026-07-13', approved: 1, rejected: 3 }, // week 2026-07-12
          { day: '2026-08-10', approved: 3, rejected: 1 }, // gap weeks in between
        ],
        NOW,
        5,
      ),
    );
    expect(summary.direction).toBe('improving');
  });

  it('has no direction with fewer than two weeks of data, and no rate with none', () => {
    const oneWeek = evaluationTrendSummary(
      evaluationTrendWeeks([{ day: '2026-08-10', approved: 2, rejected: 0 }], NOW, 4),
    );
    expect(oneWeek.direction).toBeNull();
    expect(oneWeek.rate).toBe(1);

    const empty = evaluationTrendSummary(evaluationTrendWeeks([], NOW, 4));
    expect(empty).toEqual({ approved: 0, rejected: 0, rate: null, direction: null });
  });
});

describe('evaluationTrendLabel', () => {
  it('spells out totals, rounded approval percentage, and the direction', () => {
    expect(
      evaluationTrendLabel({ approved: 4, rejected: 1, rate: 4 / 5, direction: 'improving' }),
    ).toBe('4 approved, 1 rejected — 80% approval, improving');
    expect(
      evaluationTrendLabel({ approved: 1, rejected: 2, rate: 1 / 3, direction: 'declining' }),
    ).toBe('1 approved, 2 rejected — 33% approval, declining');
    expect(evaluationTrendLabel({ approved: 3, rejected: 1, rate: 3 / 4, direction: 'flat' })).toBe(
      '3 approved, 1 rejected — 75% approval, steady',
    );
  });

  it('omits the direction clause when there is not enough data for one', () => {
    expect(evaluationTrendLabel({ approved: 2, rejected: 0, rate: 1, direction: null })).toBe(
      '2 approved, 0 rejected — 100% approval',
    );
  });

  it('says so plainly when the operator has issued no verdicts yet', () => {
    expect(evaluationTrendLabel({ approved: 0, rejected: 0, rate: null, direction: null })).toBe(
      'no operator verdicts yet',
    );
  });
});
