// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The per-project DORA-for-agents tiles (backlog web-msnsxudt-sfw78a): landing
 * frequency, task lead time, change failure rate, and MTTR, computed store-side
 * (packages/store/src/dora.ts) and rendered here as the UX-EXPRESSION follow-up
 * to that store-layer slice — a metric with no visible tile is not "complete".
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

describe('the per-project DORA tiles', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders all four DORA-for-agents metrics as their own tiles', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);

    const tiles = document.querySelectorAll('#dora-tiles .stat-tile');
    expect(tiles.length).toBe(4);
    const labels = Array.from(tiles).map((t) => t.querySelector('.stat-tile-l')?.textContent);
    expect(labels).toEqual(['landings / day', 'task lead time', 'change failure rate', 'MTTR']);
  });

  it('formats each value from the real store-computed numbers', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);

    const values = Array.from(document.querySelectorAll('#dora-tiles .stat-tile-n')).map(
      (n) => n.textContent,
    );
    expect(values).toEqual(['0.4', '1h 30m', '25%', '45m 0s']);
  });

  it('falls back to an em dash instead of a fake 0 when a rate has no data yet', async () => {
    boot({
      ...PROJECT,
      dora: {
        landingFrequency: { windowDays: 7, landings: 0, perDay: 0 },
        taskLeadTime: { tasksCompleted: 0, medianLeadTimeMs: null, meanLeadTimeMs: null },
        changeFailureRate: { shipped: 0, reverts: 0, rate: null },
        mttr: { checkpoints: 0, resolved: 0, medianRecoveryMs: null, meanRecoveryMs: null },
      },
    });
    await vi.advanceTimersByTimeAsync(1);

    const values = Array.from(document.querySelectorAll('#dora-tiles .stat-tile-n')).map(
      (n) => n.textContent,
    );
    expect(values).toEqual(['0.0', '—', '—', '—']);
  });

  it('makes every DORA tile keyboard-reachable with a real accessible label', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);

    const tiles = Array.from(document.querySelectorAll('#dora-tiles .stat-tile'));
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

  it('omits the DORA panel entirely for a project with no dora data (older read paths)', async () => {
    const { dora: _dora, ...withoutDora } = PROJECT;
    boot(withoutDora);
    await vi.advanceTimersByTimeAsync(1);

    expect(document.getElementById('dora-tiles')).toBeNull();
  });
});
