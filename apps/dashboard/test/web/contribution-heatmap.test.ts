// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The project page's "GitHub contribution graph" — a trailing 20-week, one-
 * cell-per-day calendar built from the project's flightLog (not a single sha
 * chip). A day is green when it shipped, red when it had a real death
 * (reverted/turn-capped/errored) — a death wins the cell color even if the
 * same day also shipped, so a bad day is never hidden behind an earlier good
 * one — and gray for any other flight-log activity (unverified/checkpointed).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderShell, clientJs } from '../../src/web/shell.js';

const NOW = Date.UTC(2026, 7, 12, 12, 0, 0); // Wed 2026-08-12 12:00 UTC

function firing(overrides: Record<string, unknown>) {
  return {
    id: `f-${Math.random()}`,
    item: null,
    kind: 'fix',
    sha: 'abc1234',
    shipped: false,
    gateResult: null,
    cost: 0.01,
    tokensIn: 1,
    tokensOut: 1,
    turns: 1,
    commitSubject: null,
    failedCheck: null,
    died: null,
    at: NOW,
    ...overrides,
  };
}

function projectWith(flightLog: unknown[]) {
  return {
    id: 'p1',
    slug: 'alpha',
    name: 'Alpha',
    status: 'idle',
    createdAt: 1,
    fileCount: 2,
    totalBytes: 100,
    languages: [{ language: 'typescript', files: 2, bytes: 100 }],
    topDirs: [{ dir: 'src', files: 2 }],
    hotFiles: [],
    gate: 'js · vitest run',
    backedUp: true,
    firings: flightLog.length,
    shipped: flightLog.filter((f) => (f as { shipped: boolean }).shipped).length,
    cost: 0.1,
    tokensIn: 10,
    tokensOut: 5,
    shipRate: 0.5,
    openFindings: 0,
    gauge: { critical: 0, high: 0, medium: 0, low: 0 },
    lastActivityAt: NOW,
    flightLog,
    activity: [],
    tasks: [],
  };
}

function stateWith(project: ReturnType<typeof projectWith>) {
  return {
    generatedAt: NOW,
    totals: {
      projects: 1,
      flying: 0,
      needsYou: 0,
      firings: project.firings,
      shipped: project.shipped,
      openFindings: 0,
      cost: project.cost,
    },
    projects: [project],
    empty: false,
  };
}

function boot(project: ReturnType<typeof projectWith>): void {
  document.open();
  document.write(renderShell('p1'));
  document.close();
  globalThis.fetch = vi.fn(
    async () => ({ ok: true, json: async () => stateWith(project) }) as unknown as Response,
  );
  new Function(clientJs())();
}

describe('the project-page contribution heatmap', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders a real 20-week calendar grid, ending TODAY — never future days', async () => {
    boot(projectWith([firing({ shipped: true, at: NOW })]));
    await vi.advanceTimersByTimeAsync(1);

    const cells = document.querySelectorAll('.heatmap-grid .heat-cell');
    // NOW is Wed 2026-08-12: the trailing Thu/Fri/Sat of the last week are the
    // FUTURE and must not render (caught live: cells for days that had not
    // happened yet). 20*7 minus those 3.
    expect(cells.length).toBe(20 * 7 - 3);
    expect(document.querySelector('[data-day="2026-08-13"]')).toBeNull();
    expect(document.querySelector('[data-day="2026-08-15"]')).toBeNull();
    expect(document.querySelector('[data-day="2026-08-12"]')).not.toBeNull();
  });

  it('prefers full-history dayCounts over the capped flight-log window (the lying-heatmap fix)', async () => {
    // The served log holds ONLY today's firing, but dayCounts carries the full
    // history — a busy day OUTSIDE the log window must still render green.
    const base = projectWith([firing({ shipped: true, at: NOW })]);
    const p = {
      ...base,
      dayCounts: [
        { day: '2026-08-07', ships: 19, deaths: 1, other: 0 },
        { day: '2026-08-12', ships: 1, deaths: 0, other: 0 },
      ],
    } as unknown as typeof base;
    boot(p);
    await vi.advanceTimersByTimeAsync(1);

    const busy = document.querySelector('[data-day="2026-08-07"]');
    expect(busy).not.toBeNull();
    expect(busy!.getAttribute('data-tip')).toContain('19 shipped');
    expect(busy!.classList.contains('heat-death')).toBe(true); // a death that day wins the color
  });

  it('colors a shipped day green (heat-ship-1) with a matching tooltip', async () => {
    boot(projectWith([firing({ shipped: true, at: Date.UTC(2026, 7, 12, 10, 0, 0) })]));
    await vi.advanceTimersByTimeAsync(1);

    const cell = document.querySelector('[data-day="2026-08-12"]');
    expect(cell).not.toBeNull();
    expect(cell!.classList.contains('heat-ship-1')).toBe(true);
    expect(cell!.getAttribute('data-tip')).toContain('1 shipped');
  });

  it('caps the ship intensity level at 4 even with more ships in a day', async () => {
    const day = Date.UTC(2026, 7, 10, 9, 0, 0);
    const log = [0, 1, 2, 3, 4].map(() => firing({ shipped: true, at: day }));
    boot(projectWith(log));
    await vi.advanceTimersByTimeAsync(1);

    const cell = document.querySelector('[data-day="2026-08-10"]');
    expect(cell!.classList.contains('heat-ship-4')).toBe(true);
    expect(cell!.getAttribute('data-tip')).toContain('5 shipped');
  });

  it('colors a day red when it had a death, even if the same day also shipped', async () => {
    const day = Date.UTC(2026, 7, 11, 9, 0, 0);
    boot(
      projectWith([
        firing({ shipped: true, at: day }),
        firing({ shipped: false, gateResult: 'reverted', failedCheck: 'typecheck', at: day }),
      ]),
    );
    await vi.advanceTimersByTimeAsync(1);

    const cell = document.querySelector('[data-day="2026-08-11"]');
    expect(cell!.classList.contains('heat-death')).toBe(true);
    expect(cell!.classList.contains('heat-ship-1')).toBe(false);
    expect(cell!.getAttribute('data-tip')).toContain('1 shipped');
    expect(cell!.getAttribute('data-tip')).toContain('1 died');
  });

  it('marks a day with no firings as empty', async () => {
    boot(projectWith([firing({ shipped: true, at: NOW })]));
    await vi.advanceTimersByTimeAsync(1);

    const cell = document.querySelector('[data-day="2026-08-01"]');
    expect(cell).not.toBeNull();
    expect(cell!.classList.contains('heat-empty')).toBe(true);
    expect(cell!.getAttribute('data-tip')).toBe('2026-08-01 — no firings');
  });

  it('treats a turn-capped death the same as a reverted one', async () => {
    const day = Date.UTC(2026, 7, 9, 9, 0, 0);
    boot(projectWith([firing({ shipped: false, died: 'turn-cap', at: day })]));
    await vi.advanceTimersByTimeAsync(1);

    const cell = document.querySelector('[data-day="2026-08-09"]');
    expect(cell!.classList.contains('heat-death')).toBe(true);
  });

  it('shows a legend explaining the colors', async () => {
    boot(projectWith([firing({ shipped: true, at: NOW })]));
    await vi.advanceTimersByTimeAsync(1);

    const legend = document.querySelector('.heatmap-legend');
    expect(legend?.textContent).toContain('shipped');
    expect(legend?.textContent).toContain('died');
  });

  it('renders nothing when the project has no flight history yet', async () => {
    boot(projectWith([]));
    await vi.advanceTimersByTimeAsync(1);

    expect(document.querySelector('.heatmap-wrap')).toBeNull();
  });

  // D1 TAB-STOP ROVING (board web-mtd1wyte-ssntzi): the grid rendered up to
  // 140 day cells EACH as a Tab stop — a keyboard user had to press Tab ~137
  // times to get past it. One roving stop instead; arrows walk the grid.
  it('gives the grid ONE Tab stop — today, not one per day cell (D1 TAB-STOP ROVING)', async () => {
    boot(projectWith([firing({ shipped: true, at: NOW })]));
    await vi.advanceTimersByTimeAsync(1);

    const cells = Array.from(document.querySelectorAll('.heatmap-grid .heat-cell'));
    const stops = cells.filter((c) => c.getAttribute('tabindex') === '0');
    expect(stops.length).toBe(1);
    // Today is the entry point — a 20-week-old day is a useless place to land.
    expect(stops[0]?.getAttribute('data-day')).toBe('2026-08-12');
    expect(cells.filter((c) => c.getAttribute('tabindex') === '-1').length).toBe(cells.length - 1);
  });

  it('walks the grid with arrows: Up/Down one day, Left/Right one week, Home/End the rim', async () => {
    boot(projectWith([firing({ shipped: true, at: NOW })]));
    await vi.advanceTimersByTimeAsync(1);

    const cell = (day: string) => document.querySelector(`[data-day="${day}"]`) as SVGElement;
    const key = (el: SVGElement, k: string) =>
      el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));

    key(cell('2026-08-12'), 'ArrowUp'); // one day back
    expect(cell('2026-08-11').getAttribute('tabindex')).toBe('0');
    expect(cell('2026-08-12').getAttribute('tabindex')).toBe('-1');

    key(cell('2026-08-11'), 'ArrowLeft'); // same weekday, previous week
    expect(cell('2026-08-04').getAttribute('tabindex')).toBe('0');

    key(cell('2026-08-04'), 'ArrowRight'); // same weekday, next week
    expect(cell('2026-08-11').getAttribute('tabindex')).toBe('0');

    key(cell('2026-08-11'), 'ArrowDown'); // one day forward
    expect(cell('2026-08-12').getAttribute('tabindex')).toBe('0');

    key(cell('2026-08-12'), 'Home'); // grid start (Sunday, 20 weeks back)
    expect(cell('2026-03-29').getAttribute('tabindex')).toBe('0');

    key(cell('2026-03-29'), 'End'); // back to today
    expect(cell('2026-08-12').getAttribute('tabindex')).toBe('0');
  });

  it('clamps at the rim instead of walking off the grid', async () => {
    boot(projectWith([firing({ shipped: true, at: NOW })]));
    await vi.advanceTimersByTimeAsync(1);

    const today = document.querySelector('[data-day="2026-08-12"]') as SVGElement;
    // Today is the LAST cell: a week forward or a day forward has nowhere to go.
    today.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(today.getAttribute('tabindex')).toBe('0');
    today.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(today.getAttribute('tabindex')).toBe('0');
  });

  it('moves the roving stop on direct focus too, so Tab returns where the user left', async () => {
    boot(projectWith([firing({ shipped: true, at: NOW })]));
    await vi.advanceTimersByTimeAsync(1);

    const target = document.querySelector('[data-day="2026-08-01"]') as SVGElement;
    // APG roving-tabindex: mouse/programmatic focus moves the stop as well —
    // focusin is what the delegated handler listens for.
    target.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    expect(target.getAttribute('tabindex')).toBe('0');
    expect(document.querySelector('[data-day="2026-08-12"]')?.getAttribute('tabindex')).toBe('-1');
  });
});
