// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The MODEL MIX read model (`web/stat-tiles.ts`'s `modelMixItems`, backlog
 * `web-mssn106m-bqvxi8`) is only a real feature once it has a keyboard-
 * reachable, self-explaining expression on the project detail page's Metrics
 * panel — this is that expression's regression test, mirroring
 * `anomaly-chip.test.ts`'s boot()/query pattern.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderShell, clientJs } from '../../src/web/shell.js';

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
  firings: 3,
  shipped: 3,
  cost: 0.42,
  tokensIn: 1000,
  tokensOut: 500,
  shipRate: 1,
  openFindings: 0,
  gauge: { critical: 0, high: 0, medium: 0, low: 0 },
  lastActivityAt: 1,
  activity: [],
  tasks: [],
  flightLog: [
    {
      id: 'f1',
      shipped: true,
      item: null,
      cost: 0.12,
      sha: 'abc1234',
      at: 1,
      model: 'claude-sonnet-5',
    },
    {
      id: 'f2',
      shipped: true,
      item: null,
      cost: 0.3,
      sha: 'def5678',
      at: 2,
      model: 'claude-sonnet-5',
    },
    {
      id: 'f3',
      shipped: true,
      item: null,
      cost: 0.1,
      sha: '9990001',
      at: 3,
      model: 'claude-haiku-4-5-20251001',
    },
  ],
};

const STATE = {
  generatedAt: 1,
  totals: {
    projects: 1,
    flying: 0,
    needsYou: 0,
    firings: 3,
    shipped: 3,
    openFindings: 0,
    cost: 0.42,
  },
  projects: [PROJECT],
  empty: false,
};

function boot(project: unknown): void {
  document.open();
  document.write(renderShell('p1'));
  document.close();
  globalThis.fetch = vi.fn(
    async () =>
      ({ ok: true, json: async () => ({ ...STATE, projects: [project] }) }) as unknown as Response,
  );
  new Function(clientJs())();
}

describe('MODEL MIX panel on the project detail page', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders one keyboard-reachable, self-explaining chip per model, most-used first', async () => {
    boot(PROJECT);
    await vi.advanceTimersByTimeAsync(1);

    const chips = Array.from(document.querySelectorAll('.model-mix .chip-model'));
    expect(chips.map((c) => c.textContent)).toEqual([
      'claude-sonnet-5 67%',
      'claude-haiku-4-5-20251001 33%',
    ]);
    for (const chip of chips) {
      expect(chip.getAttribute('tabindex')).toBe('0');
      expect(chip.getAttribute('data-tip')).toBeTruthy();
      expect(chip.getAttribute('aria-label')).toBeTruthy();
    }
    expect(chips[0]?.getAttribute('data-tip')).toContain(
      '2 of 3 tracked firing(s) ran claude-sonnet-5',
    );
  });

  it('renders no model-mix panel when every firing predates model tracking', async () => {
    const untracked = {
      ...PROJECT,
      flightLog: PROJECT.flightLog.map((f) => ({ ...f, model: null })),
    };
    boot(untracked);
    await vi.advanceTimersByTimeAsync(1);

    expect(document.querySelectorAll('.model-mix').length).toBe(0);
  });
});
