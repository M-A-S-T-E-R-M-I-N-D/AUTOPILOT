// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The per-project parallel-gate-savings tiles (backlog web-msnt26tn-jvyihy
 * "PARALLEL GATE + test-impact"): sampled firings, wall-clock saved, and
 * saved-vs-sequential percentage, computed store-side
 * (packages/store/src/read.ts gateParallelSavings) and rendered here as the
 * UX-EXPRESSION follow-up to that store-layer slice — a metric with no
 * visible tile is not "complete".
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderShell, clientJs } from '../../src/web/shell.js';

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
  gateParallel: {
    sampledFirings: 3,
    sequentialMs: 9000,
    observedMs: 5000,
    savedMs: 4000,
    savedPct: 4000 / 9000,
  },
};

function stateWith(project: Record<string, unknown>) {
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
    projects: [project],
    empty: false,
  };
}

function boot(project: Record<string, unknown> = PROJECT): void {
  document.open();
  document.write(renderShell('p1'));
  document.close();
  globalThis.fetch = vi.fn(
    async () => ({ ok: true, json: async () => stateWith(project) }) as unknown as Response,
  );
  new Function(clientJs())();
}

describe('the per-project parallel-gate-savings tiles', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders all three parallel-gate-savings metrics as their own tiles', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);

    const tiles = document.querySelectorAll('#gate-parallel-tiles .stat-tile');
    expect(tiles.length).toBe(3);
    const labels = Array.from(tiles).map((t) => t.querySelector('.stat-tile-l')?.textContent);
    expect(labels).toEqual(['sampled firings', 'wall-clock saved', 'saved vs sequential']);
  });

  it('formats each value from the real store-computed numbers', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);

    const values = Array.from(document.querySelectorAll('#gate-parallel-tiles .stat-tile-n')).map(
      (n) => n.textContent,
    );
    expect(values).toEqual(['3', '4s', '44%']);
  });

  it('makes every tile keyboard-reachable with a real accessible label', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);

    const tiles = Array.from(document.querySelectorAll('#gate-parallel-tiles .stat-tile'));
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

  it('omits the panel entirely when there are no sampled firings yet (no false zero)', async () => {
    boot({
      ...PROJECT,
      gateParallel: {
        sampledFirings: 0,
        sequentialMs: 0,
        observedMs: 0,
        savedMs: 0,
        savedPct: null,
      },
    });
    await vi.advanceTimersByTimeAsync(1);

    expect(document.getElementById('gate-parallel-tiles')).toBeNull();
  });

  it('omits the panel entirely for a project with no gateParallel data (older read paths)', async () => {
    const { gateParallel: _gateParallel, ...withoutGateParallel } = PROJECT;
    boot(withoutGateParallel);
    await vi.advanceTimersByTimeAsync(1);

    expect(document.getElementById('gate-parallel-tiles')).toBeNull();
  });
});
