// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * D1 TAB-STOP ROVING (epic 0015, board web-mtd1wyte-ssntzi): every fleet
 * card's `.card-meta` row (language / file-count / size chips) and
 * `.card-stats` row (firings / shipped / ship-rate tiles) gave each chip and
 * tile its own unconditional `tabindex="0"` — six Tab stops per card that
 * the 2026-09-03 post-fleet measurement still counted inside the 23.0
 * stops/added fleet card the row axis reports (cockpit-metrics.mjs). The
 * same "one Tab stop per item" anti-pattern was already fixed for the
 * card's gauge, language bar, flight-log rows and task-row chips; each of
 * these two rows now exposes ONE shared Tab stop per card, and the shared
 * wireRoving() Left/Right/Home/End pattern moves it. The project page's
 * Metrics panel reuses the `.card-stats` row shape, so it is covered too.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderShell, clientJs } from '../../src/web/shell.js';

function project(id: string, name: string) {
  return {
    id,
    slug: id,
    name,
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
    firings: 3,
    shipped: 2,
    cost: 0.5,
    tokensIn: 1000,
    tokensOut: 500,
    shipRate: 0.66,
    openFindings: 0,
    gauge: { critical: 0, high: 0, medium: 0, low: 0 },
    lastActivityAt: 1,
    activity: [],
    tasks: [],
    flightLog: [],
    anomalies: [],
  };
}

const STATE = {
  generatedAt: 1,
  totals: {
    projects: 2,
    flying: 0,
    needsYou: 0,
    firings: 6,
    shipped: 4,
    openFindings: 0,
    cost: 1,
  },
  projects: [project('p1', 'Alpha'), project('p2', 'Beta')],
  empty: false,
};

function boot(projectId?: string): void {
  document.open();
  document.write(renderShell(projectId));
  document.close();
  globalThis.fetch = vi.fn(
    async () => ({ ok: true, json: async () => STATE }) as unknown as Response,
  );
  new Function(clientJs())();
}

function stops(sel: string, root: ParentNode = document): HTMLElement[] {
  return Array.from(root.querySelectorAll(sel));
}

function tabindexes(nodes: HTMLElement[]): (string | null)[] {
  return nodes.map((n) => n.getAttribute('tabindex'));
}

describe('fleet-card meta chips and stat tiles use a roving Tab stop', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('seeds only the first meta chip and the first stat tile per card as a Tab stop', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);

    const cards = stops('.card');
    expect(cards.length).toBe(2);
    for (const card of cards) {
      const chips = stops('.card-meta .chip', card);
      expect(chips.length).toBe(3);
      expect(tabindexes(chips)).toEqual(['0', '-1', '-1']);

      // A card holds TWO .card-stats rows: cardStats itself plus the detail
      // panel's Metrics row (same shape) — each row is its own roving group.
      const rows = stops('.card-stats', card);
      expect(rows.length).toBe(2);
      for (const row of rows) {
        const tiles = stops('.stat', row);
        expect(tiles.length).toBe(3);
        expect(tabindexes(tiles)).toEqual(['0', '-1', '-1']);
      }
    }
  });

  it('moves the meta-chip roving stop with ArrowRight/End/Home, staying inside its own card', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);

    const [card1, card2] = stops('.card');
    if (!card1 || !card2) throw new Error('expected two fleet cards');
    const [c0, c1, c2] = stops('.card-meta .chip', card1);
    if (!c0 || !c1 || !c2) throw new Error('expected three meta chips on the first card');

    c0.focus();
    c0.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(document.activeElement).toBe(c1);
    expect(c0.getAttribute('tabindex')).toBe('-1');
    expect(c1.getAttribute('tabindex')).toBe('0');

    c1.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    expect(document.activeElement).toBe(c2);
    // End on the last chip of card 1 must not jump into card 2's row.
    c2.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(document.activeElement).toBe(c2);
    expect(tabindexes(stops('.card-meta .chip', card2))).toEqual(['0', '-1', '-1']);

    c2.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    expect(document.activeElement).toBe(c0);
    expect(c0.getAttribute('tabindex')).toBe('0');
  });

  it('moves the stat-tile roving stop with the arrow keys and follows programmatic focus', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);

    const row = document.querySelector('.card .card-stats');
    if (!row) throw new Error('expected a fleet card with a .card-stats row');
    const [t0, t1, t2] = stops('.stat', row);
    if (!t0 || !t1 || !t2) throw new Error('expected three stat tiles in the first row');

    t0.focus();
    t0.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(document.activeElement).toBe(t1);
    expect(tabindexes([t0, t1, t2])).toEqual(['-1', '0', '-1']);

    t1.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    expect(document.activeElement).toBe(t0);
    expect(tabindexes([t0, t1, t2])).toEqual(['0', '-1', '-1']);

    t2.focus();
    expect(tabindexes([t0, t1, t2])).toEqual(['-1', '-1', '0']);
  });

  it("seeds the project page Metrics panel's stat tiles the same way", async () => {
    boot('p1');
    await vi.advanceTimersByTimeAsync(1);

    const tiles = stops('.metrics .card-stats .stat');
    expect(tiles.length).toBe(3);
    expect(tabindexes(tiles)).toEqual(['0', '-1', '-1']);
  });
});
