// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Direct unit coverage for the FLIGHT DEBRIEF digest math
 * (`web/flight-debrief.ts`, board web-msnt50ct-oezq8r).
 * `flight-debrief-panel.test.ts` regression-tests this logic indirectly
 * through the rendered landing card in `clientJs()`; these tests exercise
 * the real functions directly instead.
 */

import { describe, it, expect } from 'vitest';
import {
  flightDebriefOf,
  flightDebriefChipItems,
  flightDebriefNotableItems,
  type FlightDebriefEntry,
} from '../../src/web/flight-debrief.js';

function verdictOf(f: {
  shipped: boolean;
  gateResult?: string | null;
  died?: string | null;
}): string {
  if (f.shipped) return 'shipped';
  if (f.gateResult === 'reverted') return 'reverted';
  if (f.gateResult === 'checkpointed') return 'checkpointed';
  if (f.died === 'turn-cap') return 'turn-capped';
  if (f.died === 'error') return 'errored';
  return 'no commit';
}

describe('flightDebriefOf', () => {
  it('returns null for an empty log — nothing to debrief yet', () => {
    expect(flightDebriefOf([], verdictOf)).toBeNull();
  });

  it('tallies shipped vs. died, sums cost/duration, and picks the cheapest win / priciest loss', () => {
    const log: (FlightDebriefEntry & {
      shipped: boolean;
      gateResult?: string | null;
      died?: string | null;
    })[] = [
      { shipped: true, cost: 2, durationMs: 1000, gateResult: null, died: null },
      { shipped: true, cost: 0.5, durationMs: 500, gateResult: null, died: null },
      { shipped: false, cost: 3, durationMs: 2000, gateResult: 'reverted', died: null },
      { shipped: false, cost: 1, durationMs: 700, gateResult: null, died: 'turn-cap' },
      { shipped: false, cost: 0.2, durationMs: 300, gateResult: 'checkpointed', died: null },
    ];
    const d = flightDebriefOf(log, verdictOf)!;
    expect(d.firings).toBe(5);
    expect(d.shipped).toBe(2);
    // reverted + turn-capped count as deaths; checkpointed does not (real WIP landed).
    expect(d.deaths).toBe(2);
    expect(d.totalCost).toBeCloseTo(6.7, 5);
    expect(d.totalDurationMs).toBe(4500);
    expect(d.best).toBe(log[1]); // cheapest shipped
    expect(d.worst).toBe(log[2]); // priciest non-ship
  });

  it('is null best/worst when the flight has no shipped or no dead firings, respectively', () => {
    const onlyShipped = flightDebriefOf([{ shipped: true, cost: 1 }], verdictOf)!;
    expect(onlyShipped.best).not.toBeNull();
    expect(onlyShipped.worst).toBeNull();

    const onlyDied = flightDebriefOf(
      [{ shipped: false, cost: 1, gateResult: 'reverted' }],
      verdictOf,
    )!;
    expect(onlyDied.best).toBeNull();
    expect(onlyDied.worst).not.toBeNull();
  });

  it('sums guard denials and counts auto-remediated firings', () => {
    const d = flightDebriefOf(
      [
        { shipped: true, cost: 1, guardDenials: 2, autoformatRescued: true },
        { shipped: true, cost: 1, guardDenials: 1, autoformatRescued: false },
        { shipped: false, cost: 1, gateResult: 'reverted' },
      ],
      verdictOf,
    )!;
    expect(d.guardDenials).toBe(3);
    expect(d.remediations).toBe(1);
  });

  it('treats missing cost/duration/guardDenials as zero rather than throwing', () => {
    const d = flightDebriefOf([{ shipped: true, cost: 0 } as FlightDebriefEntry], verdictOf)!;
    expect(d.totalCost).toBe(0);
    expect(d.totalDurationMs).toBe(0);
    expect(d.guardDenials).toBe(0);
  });
});

describe('flightDebriefChipItems', () => {
  const fmtCost = (n: number) => '$' + n.toFixed(2);
  const fmtDuration = (ms: number) => ms + 'ms';

  it('renders shipped/died/cost/duration chips in fixed order', () => {
    const d = flightDebriefOf(
      [
        { shipped: true, cost: 1, durationMs: 100 },
        { shipped: false, cost: 2, durationMs: 200, gateResult: 'reverted' } as FlightDebriefEntry,
      ],
      verdictOf,
    )!;
    const items = flightDebriefChipItems(d, fmtCost, fmtDuration);
    expect(items.map((i) => i[0])).toEqual(['1 shipped', '1 died', '$3.00', '300ms']);
    for (const item of items) {
      expect(item[1]).toBeTruthy(); // every chip explains itself on hover/focus
      expect(item[2]).toBeTruthy();
    }
  });
});

describe('flightDebriefNotableItems', () => {
  it('omits guard-denial/remediation entries entirely when zero', () => {
    const d = flightDebriefOf([{ shipped: true, cost: 1 }], verdictOf)!;
    expect(flightDebriefNotableItems(d)).toEqual([]);
  });

  it('pluralizes correctly and includes only the notable events that happened', () => {
    const d = flightDebriefOf(
      [{ shipped: true, cost: 1, guardDenials: 1, autoformatRescued: true }],
      verdictOf,
    )!;
    const items = flightDebriefNotableItems(d);
    expect(items.map((i) => i[0])).toEqual(['1 guard denial', '1 auto-remediation']);
    for (const item of items) {
      expect(item[1]).toBeTruthy(); // every chip explains itself on hover/focus
      expect(item[2]).toBeTruthy();
    }

    const d2 = flightDebriefOf(
      [
        { shipped: true, cost: 1, guardDenials: 3 },
        { shipped: true, cost: 1, autoformatRescued: true },
        { shipped: true, cost: 1, autoformatRescued: true },
      ],
      verdictOf,
    )!;
    expect(flightDebriefNotableItems(d2).map((i) => i[0])).toEqual([
      '3 guard denials',
      '2 auto-remediations',
    ]);
  });
});
