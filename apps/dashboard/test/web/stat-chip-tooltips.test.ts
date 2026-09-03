// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * App-wide interactivity audit: the fleet card's language/file-count/size
 * chips (`.card-meta .chip`) and its firings/shipped/ship-rate/recent-form
 * stats (`.card-stats .stat`) used to be plain, unexplained text — unlike the
 * fleet totals row and stat tiles, which already carry the shared [data-tip]
 * primitive. They now explain themselves on hover/focus too.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderShell, clientJs } from '../../src/web/shell.js';
import { cardStatItems, statTileAriaLabel } from '../../src/web/stat-tiles.js';

const PROJECT = {
  id: 'p1',
  slug: 'alpha',
  name: 'Alpha',
  status: 'idle',
  createdAt: 1,
  primaryLanguage: 'typescript',
  fileCount: 12,
  totalBytes: 4096,
  languages: [{ language: 'typescript', files: 12, bytes: 4096 }],
  topDirs: [],
  hotFiles: [],
  gate: 'js · vitest run',
  backedUp: true,
  firings: 4,
  shipped: 3,
  cost: 0.42,
  tokensIn: 1000,
  tokensOut: 500,
  shipRate: 0.75,
  recentShipRate: 0.8,
  openFindings: 0,
  gauge: { critical: 0, high: 0, medium: 0, low: 0 },
  lastActivityAt: 1,
  flightLog: [],
  activity: [],
  tasks: [],
};

const STATE = {
  generatedAt: 1,
  totals: {
    projects: 1,
    flying: 0,
    needsYou: 0,
    firings: 4,
    shipped: 3,
    openFindings: 0,
    cost: 0.42,
  },
  projects: [PROJECT],
  empty: false,
};

function boot(projectId: string): void {
  document.open();
  document.write(renderShell(projectId));
  document.close();
  globalThis.fetch = vi.fn(
    async () => ({ ok: true, json: async () => STATE }) as unknown as Response,
  );
  new Function(clientJs())();
}

describe('card chips and stats explain themselves on hover/focus', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('makes every card-meta chip keyboard-reachable with a tooltip and accessible label, one roving Tab stop', async () => {
    boot('p1');
    await vi.advanceTimersByTimeAsync(1);

    const chips = Array.from(document.querySelectorAll('.card-meta .chip'));
    expect(chips.length).toBe(3);
    chips.forEach((chip, i) => {
      // D1 TAB-STOP ROVING: only the first chip is a Tab stop; the rest are
      // reached with Left/Right/Home/End (card-meta-stats-roving-tabindex.test.ts).
      expect(chip.getAttribute('tabindex')).toBe(i === 0 ? '0' : '-1');
      expect(chip.getAttribute('data-tip')).toBeTruthy();
      expect(chip.getAttribute('aria-label')).toBeTruthy();
    });
  });

  it('makes every card-stats stat keyboard-reachable with a tooltip and accessible label, one roving Tab stop', async () => {
    boot('p1');
    await vi.advanceTimersByTimeAsync(1);

    // Scoped to the card's OWN .card-stats row (a direct child of .card) —
    // the Metrics detail panel nests its own, separate .card-stats inside
    // .metrics, built from metricsStatItems, not cardStatItems.
    const stats = Array.from(document.querySelectorAll('.card > .card-stats .stat'));
    const expected = cardStatItems(PROJECT).map(statTileAriaLabel);
    expect(stats.length).toBe(expected.length);
    stats.forEach((s, i) => {
      // D1 TAB-STOP ROVING: one Tab stop per row, the arrow keys reach the rest.
      expect(s.getAttribute('tabindex')).toBe(i === 0 ? '0' : '-1');
      expect(s.getAttribute('data-tip')).toBeTruthy();
      expect(s.getAttribute('aria-label')).toBe(expected[i]);
    });
  });

  it('includes the recent-form stat once a project has enough firings for one', async () => {
    boot('p1');
    await vi.advanceTimersByTimeAsync(1);

    const labels = Array.from(document.querySelectorAll('.card-stats .stat-l')).map(
      (l) => l.textContent,
    );
    expect(labels).toContain('recent form');
  });
});
