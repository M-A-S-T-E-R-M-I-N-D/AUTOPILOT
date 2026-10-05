// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Epic 0036 (provider parity): a Codex or Gemini firing reports no price,
 * and the metrics column stores that null as 0. The project page's
 * "Recently shipped" panel read such a ship as free: its cost chip printed
 * `$0.00`, its label `cost: $0.00`. `finishedFlightSummaries` now carries
 * the flight-log entry's `costUnpriced` onto the summary, and
 * `flightSummaryLineMeta` reads it as the flight log's own cost chip does
 * (`flightCostAgoMeta`).
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  finishedFlightSummaries,
  type FlightSummaryEntry,
} from '../../src/shared/flight-summary.js';
import { flightSummaryLineMeta } from '../../src/web/flight-summary-panel.js';
import { renderShell, clientJs } from '../../src/web/shell.js';

const fmtCost = (n: number): string => '$' + n.toFixed(2);
const fmtAgo = (): string => 'just now';

function entry(over: Partial<FlightSummaryEntry>): FlightSummaryEntry {
  return {
    id: 'f1',
    item: null,
    kind: 'fix',
    gateResult: 'passed',
    died: null,
    completion: 'complete',
    commitSubject: 'fix: a thing',
    shipped: true,
    cost: 0,
    sha: 'abc1234',
    at: 1,
    ...over,
  };
}

describe('finishedFlightSummaries carries an unpriced ship as unpriced (epic 0036)', () => {
  it("marks a ship whose record reports no price costUnpriced, a priced one's not", () => {
    const [codex, claude, legacy] = finishedFlightSummaries({
      tasks: [],
      flightLog: [
        entry({ id: 'codex1', cost: 0, costUnpriced: true }),
        entry({ id: 'claude1', cost: 2, costUnpriced: false }),
        entry({ id: 'legacy1', cost: 1 }),
      ],
    });
    expect(codex?.costUnpriced).toBe(true);
    expect(claude?.costUnpriced).toBe(false);
    // A flight-log row written before the field reads as priced, as before.
    expect(legacy?.costUnpriced).toBe(false);
  });
});

describe('flightSummaryLineMeta reads an unpriced ship as unpriced, never $0.00 (epic 0036)', () => {
  it('captions the cost chip unpriced and says no price was reported', () => {
    const meta = flightSummaryLineMeta(
      { headline: 'h', cost: 0, costUnpriced: true, closedTaskTitle: null, at: 1 },
      fmtCost,
      fmtAgo,
    );
    expect(meta.costText).toBe('unpriced');
    expect(meta.costAriaLabel).toBe('cost: unpriced, no price was reported');
    expect(meta.costTip).toBe('No price was reported for this firing');
  });

  it('keeps a priced ship, a real $0.00 included, as it was', () => {
    const priced = { headline: 'h', cost: 0, closedTaskTitle: null, at: 1 };
    for (const input of [{ ...priced, costUnpriced: false }, priced]) {
      const meta = flightSummaryLineMeta(input, fmtCost, fmtAgo);
      expect(meta.costText).toBe('$0.00');
      expect(meta.costAriaLabel).toBe('cost: $0.00');
      expect(meta.costTip).toBe('Total spend for this firing');
    }
  });
});

function firing(over: Record<string, unknown>): Record<string, unknown> {
  return {
    item: null,
    kind: 'fix',
    shipped: true,
    gateResult: 'passed',
    tokensIn: 100,
    tokensOut: 50,
    turns: 4,
    durationMs: 60000,
    completion: 'complete',
    failedCheck: null,
    died: null,
    ...over,
  };
}

// Newest first, as the flight log is served.
const MIXED_LOG = [
  firing({
    id: 'codex1',
    sha: 'c0dexc0',
    cost: 0,
    costUnpriced: true,
    commitSubject: 'fix: flown on codex',
    at: Date.now() - 60_000,
  }),
  firing({
    id: 'claude1',
    sha: 'c1aude1',
    cost: 2,
    commitSubject: 'fix: flown on claude',
    at: Date.now() - 120_000,
  }),
];

function boot(flightLog: unknown[]): void {
  document.open();
  document.write(renderShell('p1'));
  document.close();
  globalThis.fetch = vi.fn(
    async () =>
      ({
        ok: true,
        json: async () => ({
          generatedAt: 1,
          totals: {
            projects: 1,
            flying: 0,
            needsYou: 0,
            firings: flightLog.length,
            shipped: flightLog.length,
            openFindings: 0,
            cost: 2,
          },
          projects: [
            {
              id: 'p1',
              slug: 'alpha',
              name: 'Alpha',
              status: 'idle',
              createdAt: 1,
              primaryLanguage: 'typescript',
              fileCount: 2,
              totalBytes: 100,
              languages: [],
              topDirs: [],
              hotFiles: [],
              gate: null,
              backedUp: false,
              firings: flightLog.length,
              shipped: flightLog.length,
              cost: 2,
              tokensIn: 200,
              tokensOut: 100,
              turns: 8,
              shipRate: 1,
              openFindings: 0,
              gauge: { critical: 0, high: 0, medium: 0, low: 0 },
              lastActivityAt: 1,
              activity: [],
              flightLog,
              tasks: [],
            },
          ],
          empty: false,
        }),
      }) as unknown as Response,
  );
  new Function(clientJs())();
}

describe('the "Recently shipped" panel reads an unpriced ship as unpriced, never $0.00 (epic 0036)', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("captions the unpriced ship's cost chip unpriced, a priced one's by its cost", async () => {
    vi.useFakeTimers();
    boot(MIXED_LOG);
    await vi.advanceTimersByTimeAsync(1);

    const [codex, claude] = Array.from(document.querySelectorAll('.flight-summary-cost'));
    expect(codex!.textContent).toBe('unpriced');
    expect(codex!.getAttribute('aria-label')).toBe('cost: unpriced, no price was reported');
    expect(codex!.getAttribute('data-tip')).toContain('No price was reported');
    expect(claude!.textContent).toBe('$2.00');
    expect(claude!.getAttribute('aria-label')).toBe('cost: $2.00');
  });
});
