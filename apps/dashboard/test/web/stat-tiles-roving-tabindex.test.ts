// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * D1 TAB-STOP ROVING follow-on (board web-mtd1wyte-ssntzi): the stat-tile
 * family gave every tile its own Tab stop — the fleet-wide `#totals` bar
 * (seven or eight `.total` cells), the fleet-wide `#stat-tiles` bento grid
 * (five `.stat-tile`s, each nesting its own spark roving group), and the four
 * project-page `.stat-tiles` grids (DORA, parallel gate, warm sessions,
 * approval summary). Each bar/grid is now ONE roving group: only its first
 * tile is a Tab stop and the shared wireRoving() handlers move it with
 * Left/Right/Home/End and follow mouse/programmatic focus, scoped per grid.
 *
 * The fleet grid's tiles wrap a spark whose bars form their own roving group,
 * so this also pins the nesting contract: a keypress or focus on a bar inside
 * a tile belongs to the spark, never to the tile group around it.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderShell, clientJs } from '../../src/web/shell.js';

const NOW = Date.UTC(2026, 7, 12, 12, 0, 0);

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
    at: NOW - 3000,
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
    at: NOW - 2000,
  },
  {
    id: 'f3',
    item: null,
    kind: 'fix',
    sha: 'c3c3c3c',
    shipped: true,
    gateResult: 'passed',
    cost: 0.2,
    tokensIn: 150,
    tokensOut: 60,
    cacheReadTokens: 100,
    cacheWriteTokens: 50,
    turns: 6,
    commitSubject: 'fix: two',
    failedCheck: null,
    died: null,
    at: NOW - 1000,
  },
];

const PROJECT = {
  id: 'p1',
  slug: 'alpha',
  name: 'Alpha',
  status: 'flying',
  createdAt: 1,
  fileCount: 2,
  totalBytes: 100,
  languages: [{ language: 'typescript', files: 2, bytes: 100 }],
  topDirs: [{ dir: 'src', files: 2 }],
  hotFiles: ['src/a.ts'],
  gate: 'js · vitest run',
  backedUp: true,
  firings: 1,
  shipped: 1,
  cost: 0.1,
  tokensIn: 10,
  tokensOut: 5,
  shipRate: 1,
  openFindings: 0,
  gauge: { critical: 0, high: 0, medium: 0, low: 0 },
  lastActivityAt: 1,
  flightLog: [],
  activity: [],
  tasks: [],
  dora: {
    landingFrequency: { windowDays: 7, landings: 3, perDay: 3 / 7 },
    taskLeadTime: {
      tasksCompleted: 2,
      medianLeadTimeMs: 90 * 60 * 1000,
      meanLeadTimeMs: 100 * 60 * 1000,
    },
    changeFailureRate: { shipped: 4, reverts: 1, rate: 0.25 },
    mttr: {
      checkpoints: 1,
      resolved: 1,
      medianRecoveryMs: 45 * 60 * 1000,
      meanRecoveryMs: 45 * 60 * 1000,
    },
  },
  gateParallel: {
    sampledFirings: 3,
    sequentialMs: 9000,
    observedMs: 5000,
    savedMs: 4000,
    savedPct: 4000 / 9000,
  },
  warmSessions: {
    resumed: { firings: 4 },
    cold: { firings: 9 },
    freshInputDeltaPerFiring: 18_500,
    costDeltaPerFiring: 0.42,
    costPerTurnDeltaPerFiring: 0.03,
  },
  // Inside evolution.ts's trailing window relative to NOW (the fake clock).
  evaluationLabelDayCounts: [{ day: '2026-08-10', approved: 3, rejected: 1 }],
};

function fleetState() {
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
      realCost: 0.9,
      costPerShipped: 0.2,
      shipRate: 0.6,
      currentStreak: 3,
      avgTurns: 12.5,
      cacheReadShare: 0.75,
    },
    projects: [],
    recentFirings: SAMPLE_FIRINGS,
    empty: false,
  };
}

function projectState() {
  return {
    generatedAt: 1,
    totals: {
      projects: 1,
      flying: 1,
      needsYou: 0,
      firings: 1,
      shipped: 1,
      openFindings: 0,
      cost: 0.1,
    },
    projects: [PROJECT],
    empty: false,
  };
}

function boot(state: unknown, projectId?: string): void {
  document.open();
  document.write(renderShell(projectId));
  document.close();
  globalThis.fetch = vi.fn(
    async () => ({ ok: true, json: async () => state }) as unknown as Response,
  );
  new Function(clientJs())();
}

function all(sel: string, root: ParentNode = document): HTMLElement[] {
  return Array.from(root.querySelectorAll(sel)) as HTMLElement[];
}

function tabindexes(items: Element[]): (string | null)[] {
  return items.map((i) => i.getAttribute('tabindex'));
}

function seeded(items: Element[]): (string | null)[] {
  return items.map((_, i) => (i === 0 ? '0' : '-1'));
}

function key(target: Element, k: string): void {
  target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
}

describe('the stat-tile family uses one roving Tab stop per bar/grid instead of one per tile', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('seeds only the first #totals cell as a Tab stop', async () => {
    boot(fleetState());
    await vi.advanceTimersByTimeAsync(1);

    const cells = all('#totals .total');
    // projects, flying, firings, shipped, cost, open findings, need you, real cost
    expect(cells).toHaveLength(8);
    expect(tabindexes(cells)).toEqual(seeded(cells));
  });

  it('moves the #totals stop with ArrowRight/ArrowLeft/Home/End, clamped inside the bar', async () => {
    boot(fleetState());
    await vi.advanceTimersByTimeAsync(1);

    const cells = all('#totals .total');
    const [first, second] = cells;
    const last = cells[cells.length - 1];
    if (!first || !second || !last) throw new Error('expected the totals bar to render');

    first.focus();
    key(first, 'ArrowRight');
    expect(document.activeElement).toBe(second);
    expect(tabindexes(cells)).toEqual(cells.map((c) => (c === second ? '0' : '-1')));

    key(second, 'End');
    expect(document.activeElement).toBe(last);
    // End on the last cell stays put — it never leaks into the stat-tile grid.
    key(last, 'ArrowRight');
    expect(document.activeElement).toBe(last);
    expect(tabindexes(all('#stat-tiles .stat-tile'))).toEqual(
      seeded(all('#stat-tiles .stat-tile')),
    );

    key(last, 'Home');
    expect(document.activeElement).toBe(first);
    key(first, 'ArrowLeft');
    expect(document.activeElement).toBe(first);
  });

  it('seeds only the first #stat-tiles tile as a Tab stop while every spark keeps its own first-bar stop', async () => {
    boot(fleetState());
    await vi.advanceTimersByTimeAsync(1);

    const tiles = all('#stat-tiles .stat-tile');
    expect(tiles).toHaveLength(5);
    expect(tabindexes(tiles)).toEqual(seeded(tiles));
    for (const tile of tiles) {
      const bars = all('.spark .spark-bar', tile);
      expect(bars).toHaveLength(SAMPLE_FIRINGS.length);
      expect(tabindexes(bars)).toEqual(seeded(bars));
    }
  });

  it('moves the #stat-tiles stop between tiles and follows mouse/programmatic focus', async () => {
    boot(fleetState());
    await vi.advanceTimersByTimeAsync(1);

    const tiles = all('#stat-tiles .stat-tile');
    const [first, second, third] = tiles;
    if (!first || !second || !third) throw new Error('expected the stat-tile grid to render');

    first.focus();
    key(first, 'ArrowRight');
    expect(document.activeElement).toBe(second);
    expect(tabindexes(tiles)).toEqual(tiles.map((t) => (t === second ? '0' : '-1')));

    third.focus();
    expect(tabindexes(tiles)).toEqual(tiles.map((t) => (t === third ? '0' : '-1')));

    key(third, 'End');
    expect(document.activeElement).toBe(tiles[tiles.length - 1]);
    // The totals bar's own seeding is untouched throughout.
    expect(tabindexes(all('#totals .total'))).toEqual(seeded(all('#totals .total')));
  });

  it('leaves a keypress or focus on a spark bar INSIDE a tile to the spark group, never the tile group', async () => {
    boot(fleetState());
    await vi.advanceTimersByTimeAsync(1);

    const tiles = all('#stat-tiles .stat-tile');
    const second = tiles[1];
    if (!second) throw new Error('expected the stat-tile grid to render');
    const bars = all('.spark .spark-bar', second);
    const [bar0, bar1] = bars;
    if (!bar0 || !bar1) throw new Error('expected the ship-rate spark to render bars');

    // Focusing a nested bar must not re-seed the tile group around it.
    bar0.focus();
    expect(tabindexes(tiles)).toEqual(seeded(tiles));

    // ArrowRight on the bar walks the SPARK — focus stays inside this tile.
    key(bar0, 'ArrowRight');
    expect(document.activeElement).toBe(bar1);
    expect(tabindexes(bars)).toEqual(bars.map((b) => (b === bar1 ? '0' : '-1')));
    expect(tabindexes(tiles)).toEqual(seeded(tiles));
  });

  it('seeds only the first tile in each of the four project-page grids, scoped per grid', async () => {
    boot(projectState(), 'p1');
    await vi.advanceTimersByTimeAsync(1);

    const dora = all('#dora-tiles .stat-tile');
    const gate = all('#gate-parallel-tiles .stat-tile');
    const warm = all('#warm-sessions-tiles .stat-tile');
    const evolution = all('#evolution-tiles .stat-tile');
    expect(dora).toHaveLength(4);
    expect(gate).toHaveLength(3);
    expect(warm).toHaveLength(4);
    expect(evolution).toHaveLength(4);
    for (const grid of [dora, gate, warm, evolution]) {
      expect(tabindexes(grid)).toEqual(seeded(grid));
    }

    const [doraFirst] = dora;
    const doraLast = dora[dora.length - 1];
    if (!doraFirst || !doraLast) throw new Error('expected the DORA grid to render');
    doraFirst.focus();
    key(doraFirst, 'End');
    expect(document.activeElement).toBe(doraLast);
    // End on the last DORA tile stays put — it never leaks into the next grid.
    key(doraLast, 'ArrowRight');
    expect(document.activeElement).toBe(doraLast);
    expect(tabindexes(gate)).toEqual(seeded(gate));

    // Moving inside the warm-sessions grid leaves every other grid's seed alone.
    const [warmFirst, warmSecond] = warm;
    if (!warmFirst || !warmSecond) throw new Error('expected the warm-sessions grid to render');
    warmFirst.focus();
    key(warmFirst, 'ArrowRight');
    expect(document.activeElement).toBe(warmSecond);
    expect(tabindexes(warm)).toEqual(warm.map((t) => (t === warmSecond ? '0' : '-1')));
    expect(tabindexes(evolution)).toEqual(seeded(evolution));
    expect(tabindexes(gate)).toEqual(seeded(gate));
  });
});
