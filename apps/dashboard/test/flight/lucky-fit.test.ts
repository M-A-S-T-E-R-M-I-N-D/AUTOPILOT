// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The 🍀 fit scorer (issue #44): claimable work ranked against the operator.
 * Pure arithmetic — every case here is a candidate + operator in, a line out.
 */

import { describe, it, expect } from 'vitest';
import {
  luckyFit,
  luckyFitLine,
  mergeFitCandidates,
  parseLuckyAttention,
  parseLuckyLocale,
  LUCKY_FIT_MAX,
  type FitCandidate,
  type FitOperator,
} from '../../src/flight/lucky-fit.js';

function candidate(overrides: Partial<FitCandidate> = {}): FitCandidate {
  return {
    number: 16,
    title: 'i18n: most user-facing dashboard text never reaches STRINGS',
    url: 'https://github.com/o/r/issues/16',
    labels: ['pool: ux', 'area: i18n', 'priority: high'],
    assignees: [],
    source: 'pool',
    ...overrides,
  };
}

function operator(overrides: Partial<FitOperator> = {}): FitOperator {
  return { locale: 'he', attention: 'evening', lanes: 4, firingsFlown: 12, ...overrides };
}

describe('luckyFitLine — one candidate against one operator', () => {
  it("the issue's own example: an i18n issue for an RTL operator with cheap history scores top and says why", () => {
    const line = luckyFitLine(
      candidate({ history: { firings: 4, usd: 12.12 } }),
      operator({ locale: 'he-IL' }),
    );
    expect(line).toBeDefined();
    expect(line?.fit).toBe(1);
    expect(line?.reasoning).toBe(
      'area: i18n matches your he locale; priority: high; 4 prior firing(s) averaged $3.03 — fits one evening',
    );
  });

  it('an epic on one evening is marked down and told so; a week carries it', () => {
    const epic = candidate({ number: 28, labels: ['epic', 'area: dashboard'] });
    const evening = luckyFitLine(epic, operator({ attention: 'evening' }));
    const week = luckyFitLine(epic, operator({ attention: 'week' }));
    expect(evening?.fit).toBe(0.2);
    expect(evening?.reasoning).toBe(
      'epic; est. multi-day; exceeds one evening; this machine can carry 4 lanes',
    );
    expect(week?.fit).toBe(0.7);
    expect(week?.reasoning).toContain('a week can carry it');
  });

  it('an epic on a one-lane machine wants a fleet it does not have', () => {
    const line = luckyFitLine(
      candidate({ labels: ['epic'] }),
      operator({ lanes: 1, attention: 'week' }),
    );
    expect(line?.reasoning).toContain('one lane at most right now — an epic wants a fleet');
    expect(line?.fit).toBe(0.4);
  });

  it('a claimed issue is nobody else’s to be offered', () => {
    expect(luckyFitLine(candidate({ assignees: ['someone'] }), operator())).toBeUndefined();
  });

  it('a flight-engine issue is marked down for an operator who has never flown', () => {
    const line = luckyFitLine(
      candidate({ labels: ['area: flight-engine'] }),
      operator({ firingsFlown: 0, locale: 'en' }),
    );
    expect(line?.fit).toBe(0.3);
    expect(line?.reasoning).toBe('area: flight-engine, and you have not flown a firing yet');
  });

  it('the locale signal is about the language, and English is not a match', () => {
    expect(
      luckyFitLine(candidate({ labels: ['area: i18n'] }), operator({ locale: 'en-US' }))?.fit,
    ).toBe(0.5);
    expect(
      luckyFitLine(candidate({ labels: ['area: i18n'] }), operator({ locale: 'he-IL' }))?.fit,
    ).toBe(0.8);
  });

  it('dear history counts against an evening, is merely stated for a week', () => {
    const dear = candidate({ labels: [], history: { firings: 2, usd: 40 } });
    expect(luckyFitLine(dear, operator({ attention: 'evening' }))?.reasoning).toBe(
      '2 prior firing(s) averaged $20.00 — dear for one evening',
    );
    expect(luckyFitLine(dear, operator({ attention: 'week' }))?.reasoning).toBe(
      '2 prior firing(s) averaged $20.00',
    );
  });

  it('a good first issue is one surface — best on an evening; no signal at all says so', () => {
    const line = luckyFitLine(
      candidate({ labels: ['good first issue'], source: 'people' }),
      operator({ locale: 'en' }),
    );
    expect(line?.fit).toBe(0.7);
    expect(line?.reasoning).toBe('good first issue: one surface');
    expect(luckyFitLine(candidate({ labels: [] }), operator({ locale: 'en' }))?.reasoning).toBe(
      'no strong signal either way',
    );
  });

  it('a seasoned operator gets a nudge toward pool work their pilot can take', () => {
    const line = luckyFitLine(
      candidate({ labels: [] }),
      operator({ locale: 'en', firingsFlown: 40 }),
    );
    expect(line?.fit).toBe(0.55);
    expect(line?.reasoning).toBe('you have flown 40 firings — your pilot can take it');
  });
});

describe('luckyFit — the ranked shortlist', () => {
  it('ranks best fit first, breaks ties by issue number, drops the claimed, caps the list, counts everything considered', () => {
    const many = Array.from({ length: 8 }, (_, i) => candidate({ number: 100 + i, labels: [] }));
    const fit = luckyFit(
      [
        candidate({ number: 28, labels: ['epic'] }),
        candidate({ number: 16 }),
        candidate({ number: 9, assignees: ['taken'] }),
        ...many,
      ],
      operator(),
    );
    expect(fit.considered).toBe(11);
    expect(fit.shortlist).toHaveLength(LUCKY_FIT_MAX);
    expect(fit.shortlist[0]?.number).toBe(16);
    expect(fit.shortlist.map((l) => l.number)).toEqual([16, 100, 101, 102, 103]);
    expect(fit.shortlist.some((l) => l.number === 9)).toBe(false);
    expect(fit.attention).toBe('evening');
  });
});

describe('mergeFitCandidates — one issue in both lists', () => {
  it('keeps the pool entry (a fleet can fly it) and adds the people tier as a label', () => {
    const merged = mergeFitCandidates(
      [candidate({ number: 16 })],
      [
        candidate({ number: 16, labels: ['help wanted'], source: 'people' }),
        candidate({ number: 5, labels: ['good first issue'], source: 'people' }),
      ],
    );
    expect(merged.map((c) => [c.number, c.source])).toEqual([
      [16, 'pool'],
      [5, 'people'],
    ]);
    expect(merged[0]?.labels).toEqual(['pool: ux', 'area: i18n', 'priority: high', 'help wanted']);
  });
});

describe('the ask parsers — unrecognised input is the default, never an error', () => {
  it('attention', () => {
    expect(parseLuckyAttention('week')).toBe('week');
    expect(parseLuckyAttention('fortnight')).toBe('evening');
    expect(parseLuckyAttention(null)).toBe('evening');
  });
  it('locale', () => {
    expect(parseLuckyLocale('he')).toBe('he');
    expect(parseLuckyLocale('he-IL')).toBe('he-IL');
    expect(parseLuckyLocale('<script>')).toBe('en');
    expect(parseLuckyLocale(undefined)).toBe('en');
  });
});
