// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The Tasks card's QUEUE FORECAST line over firings that reported no price
 * (epic 0036). A Codex or Gemini run reports none, and the metrics column
 * stores that as 0, so the forecast averaged such firings in as free: a
 * $2.00 Claude firing beside a Codex one read $1.00/firing, and the queue
 * looked half as costly to drain. The flight log's entries carry
 * `costUnpriced` (`read/source.ts`'s `recordsNoPrice`), and the forecast now
 * prices its $/firing average by the priced firings alone. Drives the REAL
 * client bundle in jsdom against a mocked /api/state, with an axe pass over
 * the line.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axe from 'axe-core';
import { renderShell, clientJs } from '../../src/web/shell.js';

const firing = (id: string, cost: number, costUnpriced: boolean, completion: string) => ({
  id,
  item: null,
  kind: 'fix',
  sha: null,
  shipped: true,
  gateResult: null,
  died: null,
  cost,
  costUnpriced,
  completion,
  durationMs: 100,
  guardDenials: 0,
  autoformatRescued: false,
  createdAt: 1,
});

const MIXED = [
  firing('f1', 2, false, 'complete'),
  firing('f2', 0, true, 'complete'),
  firing('f3', 2, false, 'slice'),
  firing('f4', 0, true, 'slice'),
];
const ALL_UNPRICED = [firing('f1', 0, true, 'complete'), firing('f2', 0, true, 'slice')];

const OPEN_TASKS = [
  { id: 't1', title: 'First open thing', status: 'queued', source: 'human' },
  { id: 't2', title: 'Second open thing', status: 'queued', source: 'human' },
];

function boot(flightLog: readonly unknown[]): void {
  const project = {
    id: 'p1',
    slug: 'alpha',
    name: 'Alpha',
    status: 'idle',
    createdAt: 1,
    fileCount: 2,
    totalBytes: 100,
    languages: [],
    topDirs: [],
    hotFiles: [],
    gate: null,
    backedUp: false,
    firings: flightLog.length,
    shipped: flightLog.length,
    cost: 4,
    tokensIn: 0,
    tokensOut: 0,
    shipRate: 1,
    openFindings: 0,
    gauge: { critical: 0, high: 0, medium: 0, low: 0 },
    lastActivityAt: 1,
    flightLog,
    activity: [],
    tasks: OPEN_TASKS,
  };
  const state = {
    generatedAt: 1,
    totals: {
      projects: 1,
      flying: 0,
      needsYou: 0,
      firings: flightLog.length,
      shipped: flightLog.length,
      openFindings: 0,
      cost: 4,
    },
    projects: [project],
    empty: false,
  };
  document.open();
  document.write(renderShell('p1'));
  document.close();
  globalThis.fetch = vi.fn(
    async () => ({ ok: true, json: async () => state }) as unknown as Response,
  );
  new Function(clientJs())();
}

const forecastLine = (): HTMLElement => {
  const line = document.querySelector<HTMLElement>('.queue-forecast');
  expect(line).toBeTruthy();
  return line as HTMLElement;
};

describe('QUEUE FORECAST over unpriced firings, rendered', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('prices the drain by the priced firings alone, and names the ones it left out', async () => {
    boot(MIXED);
    const line = await vi.waitFor(forecastLine, { timeout: 5000 });
    // 2 completes over 4 firings; 2 open tasks → 4 firings at $2.00 each.
    expect(line.textContent).toBe('Queue drains in ~4 firings / ~$8.00');
    expect(line.getAttribute('data-tip')).toContain(
      '$2.00/firing average (2 unpriced left out, no price was reported)',
    );
    expect(line.getAttribute('aria-label')).toBe(line.getAttribute('data-tip'));
  });

  it('a window with no priced firing reads its cost as unpriced, never $0.00', async () => {
    boot(ALL_UNPRICED);
    const line = await vi.waitFor(forecastLine, { timeout: 5000 });
    expect(line.textContent).toBe('Queue drains in ~4 firings / cost unpriced');
    expect(line.getAttribute('data-tip')).not.toContain('$0.00');
  });

  it('is axe-clean', async () => {
    boot(MIXED);
    const line = await vi.waitFor(forecastLine, { timeout: 5000 });
    const results = await axe.run(line, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(results.violations.map((v) => v.id)).toEqual([]);
  });
});
