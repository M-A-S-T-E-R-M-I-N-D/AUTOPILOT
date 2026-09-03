// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * ADAPTIVE TASK BUDGET (board web-msnt26wf-wnv3w7, "deaths cluster on
 * under-budgeted epics"): a task that has hit the global turn cap before
 * (`FlightEntry.died === 'turn-cap'`, `flight-metrics.ts`'s
 * `taskBudgetSignalOf`) earns a keyboard-reachable "try N turns" chip
 * suggesting a bigger budget for its next firing — the UX-EXPRESSION half of
 * the risk-score derivation.
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

function projectWith(tasks: unknown[], flightLog: unknown[]) {
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
    flightLog,
    tasks,
  };
}

function boot(tasks: unknown[], flightLog: unknown[] = []): void {
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
          projects: [projectWith(tasks, flightLog)],
          empty: false,
        }),
      }) as unknown as Response,
  );
  new Function(clientJs())();
}

describe('ADAPTIVE TASK BUDGET risk chip', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders a keyboard-reachable budget-risk chip for a task that turn-capped before', async () => {
    boot([task({})], [{ item: 't1', died: 'turn-cap' }]);
    await vi.advanceTimersByTimeAsync(1);

    const chip = document.querySelector('.chip-budget-risk');
    expect(chip).toBeTruthy();
    expect(chip!.textContent).toBe('⏱ try 180t');
    // Roving tabindex (D1 TAB-STOP ROVING, board web-mtd1wyte-ssntzi): this
    // row's burn chip (the same claiming firing also counts as burn) renders
    // first, so it holds the row's one Tab stop — the budget-risk chip is
    // still keyboard-reachable via Left/Right through the shared roving group.
    expect(chip!.getAttribute('tabindex')).toBe('-1');
    expect(chip!.getAttribute('data-tip')).toContain('120-turn cap 1 time');
    expect(chip!.getAttribute('data-tip')).toContain('~180 turns');
    // D1 ATTRIBUTE PAYLOAD (epic 0015): aria-label states the suggestion
    // concisely, not the full data-tip sentence duplicated verbatim.
    expect(chip!.getAttribute('aria-label')).toBe('Budget risk: try 180 turns');
    expect(chip!.getAttribute('aria-label')).not.toContain('120-turn cap');
  });

  it('scales the suggestion up for a task that has turn-capped repeatedly', async () => {
    boot(
      [task({})],
      [
        { item: 't1', died: 'turn-cap' },
        { item: 't1', died: 'turn-cap' },
      ],
    );
    await vi.advanceTimersByTimeAsync(1);

    const chip = document.querySelector('.chip-budget-risk');
    expect(chip!.textContent).toBe('⏱ try 240t');
  });

  it('renders no budget-risk chip for a task that has never turn-capped', async () => {
    boot([task({})], [{ item: 't1', died: null }]);
    await vi.advanceTimersByTimeAsync(1);

    expect(document.querySelector('.chip-budget-risk')).toBeNull();
  });

  it('renders no budget-risk chip when another task turn-capped, not this one', async () => {
    boot([task({ id: 't1' })], [{ item: 'other', died: 'turn-cap' }]);
    await vi.advanceTimersByTimeAsync(1);

    expect(document.querySelector('.chip-budget-risk')).toBeNull();
  });

  it('falls back to a dimension-breadth chip for a task that has never itself turn-capped', async () => {
    // t2 (the dimension peer) DID turn-cap, so t2's own row legitimately
    // shows its own .chip-budget-risk too — irrelevant to this assertion,
    // which is scoped to t1's row only.
    boot(
      [task({ id: 't1', dimension: 'security' }), task({ id: 't2', dimension: 'security' })],
      [{ item: 't2', died: 'turn-cap' }],
    );
    await vi.advanceTimersByTimeAsync(1);

    const row = document.querySelector('[data-task-id="t1"]') as HTMLElement;
    const chip = row.querySelector('.chip-budget-risk-dim');
    expect(chip).toBeTruthy();
    expect(chip!.textContent).toBe('⏱ try 180t?');
    // Roving tabindex (D1 TAB-STOP ROVING, board web-mtd1wyte-ssntzi): this
    // row's plain dimension badge renders before the budget-risk-dim chip, so
    // the badge holds the row's one Tab stop; the fallback chip is still
    // keyboard-reachable via Left/Right through the shared roving group.
    expect(chip!.getAttribute('tabindex')).toBe('-1');
    expect(chip!.getAttribute('data-tip')).toContain(
      'Other security tasks hit the 120-turn cap 1 time',
    );
    // D1 ATTRIBUTE PAYLOAD (epic 0015): same concise-aria-label fix as the
    // task's own budget-risk chip above, applied to the dimension fallback.
    expect(chip!.getAttribute('aria-label')).toBe('Budget risk from similar work: try 180 turns');
    expect(chip!.getAttribute('aria-label')).not.toContain('security tasks hit');
    expect(row.querySelector('.chip-budget-risk')).toBeNull();
  });

  it("prefers the task's own budget-risk chip over the dimension fallback when both apply", async () => {
    // Both t1 AND its dimension peer t2 turn-capped — t1 still gets its OWN
    // chip, never the dimension fallback too, since a task's own scars
    // outrank an advisory drawn from similar work.
    boot(
      [task({ id: 't1', dimension: 'security' }), task({ id: 't2', dimension: 'security' })],
      [
        { item: 't1', died: 'turn-cap' },
        { item: 't2', died: 'turn-cap' },
      ],
    );
    await vi.advanceTimersByTimeAsync(1);

    const row = document.querySelector('[data-task-id="t1"]') as HTMLElement;
    expect(row.querySelectorAll('.chip-budget-risk')).toHaveLength(1);
    expect(row.querySelector('.chip-budget-risk-dim')).toBeNull();
  });

  it('renders no dimension-fallback chip for a dimension-less task', async () => {
    boot(
      [task({ id: 't1', dimension: null }), task({ id: 't2', dimension: null })],
      [{ item: 't2', died: 'turn-cap' }],
    );
    await vi.advanceTimersByTimeAsync(1);

    expect(document.querySelector('.chip-budget-risk-dim')).toBeNull();
  });
});
