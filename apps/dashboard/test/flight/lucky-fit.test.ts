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
  poolFitCandidate,
  LUCKY_FIT_MAX,
  type FitCandidate,
  type FitOperator,
} from '../../src/flight/lucky-fit.js';
import {
  DECLINED_LABEL,
  isMaintainerMarked,
  planClaimPoolIssue,
  planPoolBrowseBatch,
  type PoolBrowseEntry,
  type PoolIssue,
} from '../../src/flight/pool-client.js';
import { claimLedger, type IssueCommentLike } from '../../src/flight/claim-ledger.js';
import { HOLD_LABELS } from '../../src/flight/issue-triage.js';
import { HOUSE_TAXONOMY_LABELS } from '../../src/flight/taxonomy-seed.js';

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

  // A Codex or Gemini run reports no price and the metrics column stores it as
  // 0 (epic 0036), so averaged in it made a dear issue read cheaper than it is.
  it('averages history over its priced firings alone and names the unpriced ones left out', () => {
    const mixed = candidate({ labels: [], history: { firings: 4, usd: 40, unpriced: 2 } });
    const line = luckyFitLine(mixed, operator({ attention: 'evening', locale: 'en' }));
    expect(line?.reasoning).toBe(
      '2 priced prior firing(s) averaged $20.00 (2 unpriced left out) — dear for one evening',
    );
    expect(line?.fit).toBe(0.4);
  });

  it('a history with no priced firing is not read as free and moves no score', () => {
    const unpriced = candidate({ labels: [], history: { firings: 3, usd: 0, unpriced: 3 } });
    const line = luckyFitLine(unpriced, operator({ locale: 'en' }));
    expect(line?.reasoning).toBe('3 prior firing(s), unpriced — no price was reported');
    expect(line?.fit).toBe(0.5);
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

// Epic 0019 additive-only law, the 🍀 roll × the maintainer's marks. The pool
// client still lists a pool issue the maintainer has declined or put on hold —
// it stays open for its reporter to reply to (CONTRIBUTING.md) — and the pool
// claim skips it (pool-client.ts planClaimPoolIssue). The scorer read only the
// assignees, so it could rank that issue the best work to fly, and the claim
// the operator then made on it was refused.
describe("luckyFitLine × the maintainer's declined and held issues (regression, epic 0019 additive-only law)", () => {
  const seeded = (name: string) =>
    HOUSE_TAXONOMY_LABELS.find((label) => label.name === name)?.name ?? '';
  const marks = [seeded('declined'), seeded('status: awaiting-human'), seeded('status: blocked')];
  const marked = (mark: string) => candidate({ labels: [...candidate().labels, mark] });

  it('reads the labels the pool claim skips on, as the seeder stamps them', () => {
    expect([DECLINED_LABEL, ...HOLD_LABELS]).toEqual(marks);
  });

  it.each(marks)('never offers a pool issue marked "%s", which the claim would refuse', (mark) => {
    expect(planClaimPoolIssue(candidate(), 'octocat').decision).toBe('claim');
    expect(luckyFitLine(candidate(), operator())).toBeDefined();

    expect(planClaimPoolIssue(marked(mark), 'octocat').decision).toBe('skip');
    expect(luckyFitLine(marked(mark), operator())).toBeUndefined();
  });

  it('drops a marked issue from the shortlist and still counts it as considered', () => {
    const fit = luckyFit(
      [{ ...marked(DECLINED_LABEL), number: 16 }, candidate({ number: 17, labels: [] })],
      operator(),
    );
    expect(fit.considered).toBe(2);
    expect(fit.shortlist.map((l) => l.number)).toEqual([17]);
  });
});

// The pool claim reads a maintainer's mark in any casing AND hyphenation
// (pool-client.ts isMaintainerMarked: `status: awaiting human` is the hold
// `status: awaiting-human`). The roll folded casing only, so on a repo whose
// own hold label is spelled with a space it ranked an issue the claim refuses.
describe("luckyFitLine × the maintainer's marks in any casing or hyphenation (regression, epic 0019 additive-only law)", () => {
  const variants = [
    'Declined',
    'DECLINED',
    'Status: Awaiting-Human',
    'status: awaiting human',
    'Status: Awaiting Human',
    'Status: Blocked',
  ];
  const marked = (mark: string) => candidate({ labels: [...candidate().labels, mark] });

  it.each(variants)('never offers an issue marked "%s", which the claim refuses', (mark) => {
    expect(isMaintainerMarked([mark])).toBe(true);
    expect(planClaimPoolIssue(marked(mark), 'octocat').decision).toBe('skip');
    expect(luckyFitLine(marked(mark), operator())).toBeUndefined();
  });

  it('drops every variant from the shortlist and keeps the unmarked one', () => {
    const fit = luckyFit(
      [
        ...variants.map((mark, i) => ({ ...marked(mark), number: 20 + i })),
        candidate({ number: 30 }),
      ],
      operator(),
    );
    expect(fit.considered).toBe(variants.length + 1);
    expect(fit.shortlist.map((l) => l.number)).toEqual([30]);
  });

  it('still offers an issue whose label only resembles a mark', () => {
    for (const label of ['declined-upstream', 'status: blocked on ci', 'awaiting-human']) {
      expect(isMaintainerMarked([label])).toBe(false);
      expect(luckyFitLine(marked(label), operator())).toBeDefined();
    }
  });
});

// The claims ledger (claim-ledger.ts) reads a pool-client claim comment as a
// live claim even when its assign failed: GitHub refuses to assign an outside
// contributor, so only the comment lands (#27). The claim contests such an
// issue and the Pool panel paints it held. The roll read the assignees alone,
// so it offered that issue as free work to fly.
describe('poolFitCandidate × a claim the ledger reads from a comment (regression, #27)', () => {
  const NOW = Date.parse('2026-10-03T12:00:00Z');
  const DAY = 24 * 60 * 60 * 1000;
  const claimedBy = (login: string, daysAgo: number) => ({
    author: login,
    createdAt: NOW - daysAgo * DAY,
    body: `Claimed by ${login} via the pool client.`,
  });
  const entryFor = (
    number: number,
    comments: readonly IssueCommentLike[],
    assignees: readonly string[] = [],
  ) => {
    const issue: PoolIssue = {
      number,
      title: `pool issue ${number}`,
      url: `https://github.com/o/r/issues/${number}`,
      labels: candidate().labels,
      assignees,
      claims: claimLedger(assignees, comments),
    };
    const [entry] = planPoolBrowseBatch([issue], 'octocat', NOW);
    return entry as PoolBrowseEntry;
  };

  it('carries the issue through as a pool candidate', () => {
    expect(poolFitCandidate(entryFor(16, []))).toEqual({
      number: 16,
      title: 'pool issue 16',
      url: 'https://github.com/o/r/issues/16',
      labels: candidate().labels,
      assignees: [],
      source: 'pool',
    });
  });

  it('never offers an issue held only by a live claim comment, which the claim contests', () => {
    const held = entryFor(16, [claimedBy('gabibi555', 2)]);
    expect(held.issue.assignees).toEqual([]);
    expect(held.decision.decision).toBe('contest');
    expect(luckyFitLine(poolFitCandidate(held), operator())).toBeUndefined();
  });

  it('still offers an issue whose comment claim went stale, which the claim releases', () => {
    const stale = entryFor(16, [claimedBy('gabibi555', 20)]);
    expect(stale.decision.decision).toBe('claim');
    expect(luckyFitLine(poolFitCandidate(stale), operator())).toBeDefined();
  });

  it('drops the held and the assigned from the shortlist and still counts them as considered', () => {
    const fit = luckyFit(
      [
        entryFor(16, [claimedBy('gabibi555', 2)]),
        entryFor(17, [], ['someone']),
        entryFor(18, []),
      ].map(poolFitCandidate),
      operator(),
    );
    expect(fit.considered).toBe(3);
    expect(fit.shortlist.map((l) => l.number)).toEqual([18]);
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
