// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The fleet's derived-rate metrics (cost/shipped, ship rate, streak, avg
 * turns, cache-read share) used to be five plain `.total` cells bolted onto
 * the raw-count totals row. They now render as their own M3 elevated bento
 * grid (`#stat-tiles` / `.stat-tile`) — a real card surface, not a text row —
 * while the raw counts (projects, firings, shipped, cost, ...) stay in the
 * original `.totals` bar.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderShell, clientJs } from '../../src/web/shell.js';

const NOW = Date.UTC(2026, 7, 12, 12, 0, 0);

function stateWith(
  totals: Record<string, unknown>,
  recentFirings: unknown[] = [],
  projects: unknown[] = [],
) {
  return {
    generatedAt: NOW,
    totals: {
      projects: 3,
      flying: 1,
      needsYou: 0,
      firings: 10,
      shipped: 6,
      openFindings: 2,
      cost: 1.2,
      costPerShipped: 0.2,
      shipRate: 0.6,
      currentStreak: 3,
      avgTurns: 12.5,
      cacheReadShare: 0.75,
      ...totals,
    },
    projects,
    recentFirings,
    empty: false,
  };
}

const SAMPLE_FIRINGS = [
  {
    id: 'f1',
    item: null,
    kind: 'feat',
    sha: 'a1a1a1a',
    shipped: true,
    gateResult: 'passed',
    cost: 0.1,
    tokensIn: 100,
    tokensOut: 50,
    cacheReadTokens: 300,
    cacheWriteTokens: 100,
    turns: 4,
    commitSubject: 'feat: one',
    failedCheck: null,
    died: null,
    at: NOW - 2000,
  },
  {
    id: 'f2',
    item: null,
    kind: 'fix',
    sha: 'b2b2b2b',
    shipped: false,
    gateResult: 'reverted',
    cost: 0.3,
    tokensIn: 200,
    tokensOut: 80,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    turns: 9,
    commitSubject: null,
    failedCheck: 'test',
    died: null,
    at: NOW - 1000,
  },
];

function boot(
  totals: Record<string, unknown> = {},
  recentFirings: unknown[] = [],
  projects: unknown[] = [],
): void {
  document.open();
  document.write(renderShell());
  document.close();
  globalThis.fetch = vi.fn(
    async () =>
      ({
        ok: true,
        json: async () => stateWith(totals, recentFirings, projects),
      }) as unknown as Response,
  );
  new Function(clientJs())();
}

describe('fleet stat tiles (bento grid)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders the five derived-rate metrics as their own M3 tiles, not plain totals', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);

    const tiles = document.querySelectorAll('#stat-tiles .stat-tile');
    expect(tiles.length).toBe(5);
    const labels = Array.from(tiles).map((t) => t.querySelector('.stat-tile-l')?.textContent);
    expect(labels).toEqual([
      'cost / shipped',
      'ship rate',
      'streak',
      'avg turns',
      'cache-read share',
    ]);
  });

  it('formats each metric value the same way the old totals row did', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);

    const values = Array.from(document.querySelectorAll('#stat-tiles .stat-tile-n')).map(
      (n) => n.textContent,
    );
    expect(values).toEqual(['$0.20', '60%', '3', '12.5', '75%']);
  });

  it('falls back to an em dash instead of a fake 0 when a rate has no data yet', async () => {
    boot({
      costPerShipped: null,
      shipRate: null,
      currentStreak: 0,
      avgTurns: null,
      cacheReadShare: null,
    });
    await vi.advanceTimersByTimeAsync(1);

    const values = Array.from(document.querySelectorAll('#stat-tiles .stat-tile-n')).map(
      (n) => n.textContent,
    );
    expect(values).toEqual(['—', '—', '0', '—', '—']);
  });

  it('keeps the raw counts in the original totals bar, not duplicated into the tiles', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);

    const totalsLabels = Array.from(document.querySelectorAll('#totals .total-l')).map(
      (l) => l.textContent,
    );
    expect(totalsLabels).toEqual([
      'projects',
      'flying',
      'firings',
      'shipped',
      'cost',
      'open findings',
      'need you',
    ]);
    expect(document.querySelector('#totals .stat-tile')).toBeNull();
  });

  it('makes every tile keyboard-reachable with a real accessible label', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);

    const tiles = Array.from(document.querySelectorAll('#stat-tiles .stat-tile'));
    // Roving tabindex (D1 TAB-STOP ROVING): the grid is one Tab stop; arrow
    // keys reach the rest (see stat-tiles-roving-tabindex.test.ts).
    expect(tiles.map((t) => t.getAttribute('tabindex'))).toEqual(
      tiles.map((_, i) => (i === 0 ? '0' : '-1')),
    );
    for (const tile of tiles) {
      expect(tile.getAttribute('aria-label')).toBeTruthy();
      expect(tile.getAttribute('data-tip')).toBeTruthy();
    }
  });

  it('renders a real per-firing spark inside every tile once fleet-wide firing history exists', async () => {
    boot({}, SAMPLE_FIRINGS);
    await vi.advanceTimersByTimeAsync(1);

    const tiles = Array.from(document.querySelectorAll('#stat-tiles .stat-tile'));
    expect(tiles.length).toBe(5);
    for (const tile of tiles) {
      const bars = tile.querySelectorAll('.spark .spark-bar');
      expect(bars.length).toBe(SAMPLE_FIRINGS.length);
    }
  });

  it('omits the spark (no fake trend) when there is no fleet-wide firing history', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);

    expect(document.querySelector('#stat-tiles .spark')).toBeNull();
  });

  it('colors the ship-rate/streak spark bars by verdict, matching the real outcome', async () => {
    boot({}, SAMPLE_FIRINGS);
    await vi.advanceTimersByTimeAsync(1);

    const tiles = Array.from(document.querySelectorAll('#stat-tiles .stat-tile'));
    const shipRateBars = tiles[1]!.querySelectorAll('.spark-bar');
    expect(shipRateBars[0]!.getAttribute('class')).toContain('spark-shipped');
    expect(shipRateBars[1]!.getAttribute('class')).toContain('spark-reverted');
  });

  it('computes the cache-read-share spark from the real per-firing cache tokens, not a guess', async () => {
    boot({}, SAMPLE_FIRINGS);
    await vi.advanceTimersByTimeAsync(1);

    const tiles = Array.from(document.querySelectorAll('#stat-tiles .stat-tile'));
    const cacheBars = tiles[4]!.querySelectorAll('.spark-bar');
    // f1: 300 / (100 + 300 + 100) = 60% cached; f2: no cache activity at all.
    expect(cacheBars[0]!.getAttribute('data-tip-cost')).toBe('60% cached');
    expect(cacheBars[1]!.getAttribute('data-tip-cost')).toBe('0% cached');
  });
});
