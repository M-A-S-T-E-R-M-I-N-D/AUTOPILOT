// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * TASK ECONOMICS's operator-review flag: a task that has burned real
 * firings/dollars without ever closing (`TaskEntry.isRunaway`, derived from
 * lifetime `metrics.item` totals — see `taskEconomics`, `@autopilot/store`)
 * gets a keyboard-reachable, self-explaining "runaway" chip — the UX-
 * EXPRESSION half of the store-side derivation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderShell, clientJs } from '../../src/web/shell.js';

const NOW = Date.UTC(2026, 7, 12, 12, 0, 0);

function task(overrides: Record<string, unknown>) {
  return {
    id: 't1',
    title: 'Epic thing',
    status: 'queued',
    severity: null,
    dimension: null,
    focus: false,
    priority: null,
    source: 'dashboard',
    at: 1,
    cumulativeCostUsd: 0,
    firingCount: 0,
    isRunaway: false,
    ...overrides,
  };
}

function projectWith(tasks: unknown[]) {
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
    firings: 0,
    shipped: 0,
    cost: 0.4,
    tokensIn: 300,
    tokensOut: 130,
    turns: 13,
    shipRate: 0.5,
    openFindings: 0,
    gauge: { critical: 0, high: 0, medium: 0, low: 0 },
    lastActivityAt: NOW,
    activity: [],
    flightLog: [],
    tasks,
  };
}

function boot(tasks: unknown[]): void {
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
            firings: 0,
            shipped: 0,
            openFindings: 0,
            cost: 0.4,
          },
          projects: [projectWith(tasks)],
          empty: false,
        }),
      }) as unknown as Response,
  );
  new Function(clientJs())();
}

describe('TASK ECONOMICS runaway chip', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders a keyboard-reachable runaway chip with cost/firing evidence', async () => {
    boot([task({ isRunaway: true, cumulativeCostUsd: 87.3, firingCount: 14 })]);
    await vi.advanceTimersByTimeAsync(1);

    const chip = document.querySelector('.chip-runaway');
    expect(chip).toBeTruthy();
    expect(chip!.textContent).toBe('⚠️ runaway');
    // D1 TAB-STOP ROVING (board web-mtd1wyte-ssntzi): the chip shares one
    // roving group with the row's status pill and title — the pill comes
    // first in DOM order and holds the '0' stop, so the chip is
    // arrow-reachable at '-1' rather than a stop of its own.
    expect(chip!.getAttribute('tabindex')).toBe('-1');
    expect(chip!.getAttribute('data-tip')).toContain('$87.30');
    expect(chip!.getAttribute('data-tip')).toContain('14 firings');
    // D1 ATTRIBUTE PAYLOAD (epic 0015): aria-label carries the cost/firing
    // facts concisely, not the full data-tip sentence duplicated verbatim.
    expect(chip!.getAttribute('aria-label')).toBe('Runaway: $87.30 across 14 firings');
    expect(chip!.getAttribute('aria-label')).not.toContain('without ever closing');
  });

  it('renders no runaway chip for a task that has not cleared the threshold', async () => {
    boot([task({ isRunaway: false, cumulativeCostUsd: 5, firingCount: 2 })]);
    await vi.advanceTimersByTimeAsync(1);

    expect(document.querySelector('.chip-runaway')).toBeNull();
  });
});
