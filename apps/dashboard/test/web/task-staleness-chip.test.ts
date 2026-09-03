// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * TRIAGE V2's UX-EXPRESSION half (web-mssnofje-bboigi): `stalenessDays` — the
 * model-free factor `computeTriageFactors` (`flight/triage.ts`) already logs
 * to `events` before every post-flight triage run — now also drives a
 * keyboard-reachable STALE chip on the row itself, not just the triage
 * prompt/audit trail.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderShell, clientJs } from '../../src/web/shell.js';

const NOW = Date.UTC(2026, 7, 12, 12, 0, 0);
const DAY_MS = 86_400_000;

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
    at: NOW,
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

describe('TRIAGE V2 staleness chip', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders a keyboard-reachable stale chip for a queued task at the threshold', async () => {
    boot([task({ at: NOW - 14 * DAY_MS })]);
    await vi.advanceTimersByTimeAsync(1);

    const chip = document.querySelector('.chip-stale');
    expect(chip).toBeTruthy();
    expect(chip!.textContent).toBe('🕒 14d stale');
    // D1 TAB-STOP ROVING (board web-mtd1wyte-ssntzi): the chip shares one
    // roving group with the row's status pill and title — the pill comes
    // first in DOM order and holds the '0' stop, so the chip is
    // arrow-reachable at '-1' rather than a stop of its own.
    expect(chip!.getAttribute('tabindex')).toBe('-1');
    expect(chip!.getAttribute('data-tip')).toContain('14 days');
    // D1 ATTRIBUTE PAYLOAD (epic 0015): aria-label states the day count
    // concisely, not the full data-tip sentence duplicated verbatim.
    expect(chip!.getAttribute('aria-label')).toBe('Stale: 14 days');
    expect(chip!.getAttribute('aria-label')).not.toContain('without closing');
  });

  it('renders no stale chip for a queued task under the threshold', async () => {
    boot([task({ at: NOW - 13 * DAY_MS })]);
    await vi.advanceTimersByTimeAsync(1);

    expect(document.querySelector('.chip-stale')).toBeNull();
  });

  it('renders no stale chip for a non-queued task, however old', async () => {
    boot([task({ status: 'in_progress', at: NOW - 90 * DAY_MS })]);
    await vi.advanceTimersByTimeAsync(1);

    expect(document.querySelector('.chip-stale')).toBeNull();
  });
});
