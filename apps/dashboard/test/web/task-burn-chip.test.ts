// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * TASK BURN chips: a task card shows its accumulated burn — slices worked so
 * far, total $ spent, and total wall time — computed from the flight log's
 * `item` claims (the same field METRICS lines and finishedFlightSummaries
 * already key off). Epics stop being bottomless: the operator sees what a
 * task has cost before deciding whether to keep funding it.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderShell, clientJs } from '../../src/web/shell.js';

const NOW = Date.UTC(2026, 7, 12, 12, 0, 0);

function firing(overrides: Record<string, unknown>) {
  return {
    id: `f-${Math.random()}`,
    item: null,
    kind: 'fix',
    sha: 'abc1234',
    shipped: true,
    gateResult: 'passed',
    cost: 0.01,
    tokensIn: 1,
    tokensOut: 1,
    turns: 1,
    durationMs: null,
    commitSubject: null,
    completion: null,
    failedCheck: null,
    died: null,
    at: NOW,
    ...overrides,
  };
}

function projectWith(flightLog: unknown[], tasks: unknown[]) {
  return {
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
    shipped: flightLog.filter((f) => (f as { shipped: boolean }).shipped).length,
    cost: 0.4,
    tokensIn: 300,
    tokensOut: 130,
    turns: 13,
    shipRate: 0.5,
    openFindings: 0,
    gauge: { critical: 0, high: 0, medium: 0, low: 0 },
    lastActivityAt: NOW,
    activity: [],
    flightLog,
    tasks,
  };
}

function boot(flightLog: unknown[], tasks: unknown[]): void {
  document.open();
  document.write(renderShell('p1'));
  document.close();
  globalThis.fetch = vi.fn(
    async () =>
      ({
        ok: true,
        json: async () => ({
          generatedAt: NOW,
          totals: {
            projects: 1,
            flying: 0,
            needsYou: 0,
            firings: flightLog.length,
            shipped: 1,
            openFindings: 0,
            cost: 0.4,
          },
          projects: [projectWith(flightLog, tasks)],
          empty: false,
        }),
      }) as unknown as Response,
  );
  new Function(clientJs())();
}

describe('TASK BURN chips', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('sums slices, cost, and wall time across every firing that claimed the task', async () => {
    const tasks = [
      {
        id: 't1',
        title: 'Epic thing',
        status: 'in_progress',
        severity: null,
        dimension: null,
        focus: false,
        priority: null,
        source: 'dashboard',
        at: 1,
      },
    ];
    const log = [
      firing({ item: 't1', cost: 1.5, durationMs: 60000, completion: 'slice' }),
      firing({ item: 't1', cost: 2.34, durationMs: 120000, completion: 'complete' }),
      firing({ item: null, cost: 99, durationMs: 999999 }), // unrelated firing — must not bleed in
    ];
    boot(log, tasks);
    await vi.advanceTimersByTimeAsync(1);

    const chip = document.querySelector('.chip-burn');
    expect(chip).toBeTruthy();
    expect(chip!.textContent).toContain('2 slices');
    expect(chip!.textContent).toContain('$3.84');
    expect(chip!.textContent).toContain('3m');
    // D1 TAB-STOP ROVING (board web-mtd1wyte-ssntzi): the chip shares one
    // roving group with the row's status pill and title — the pill comes
    // first in DOM order and holds the '0' stop, so the chip is
    // arrow-reachable at '-1' rather than a stop of its own.
    expect(chip!.getAttribute('tabindex')).toBe('-1');
    // D1 ATTRIBUTE PAYLOAD (epic 0015): aria-label must not duplicate the
    // full data-tip sentence verbatim — it carries the same short text the
    // chip already shows, not the explanatory clause the tip alone owns.
    expect(chip!.getAttribute('aria-label')).toBe('Burn: 2 slices · $3.84 · 3m 0s');
    expect(chip!.getAttribute('aria-label')).not.toContain('worked this task');
  });

  it('renders no burn chip for a task with zero claiming firings', async () => {
    const tasks = [
      {
        id: 't2',
        title: 'Fresh task',
        status: 'queued',
        severity: null,
        dimension: null,
        focus: false,
        priority: null,
        source: 'dashboard',
        at: 1,
      },
    ];
    boot([firing({ item: 'other-task', cost: 5 })], tasks);
    await vi.advanceTimersByTimeAsync(1);

    expect(document.querySelector('.chip-burn')).toBeNull();
  });

  it('omits the wall-time segment when no claiming firing carries real duration data', async () => {
    const tasks = [
      {
        id: 't3',
        title: 'No timing yet',
        status: 'in_progress',
        severity: null,
        dimension: null,
        focus: false,
        priority: null,
        source: 'dashboard',
        at: 1,
      },
    ];
    boot([firing({ item: 't3', cost: 0.5, durationMs: null })], tasks);
    await vi.advanceTimersByTimeAsync(1);

    const chip = document.querySelector('.chip-burn');
    expect(chip).toBeTruthy();
    expect(chip!.textContent).toBe('🔥 1 slice · $0.50');
  });
});
