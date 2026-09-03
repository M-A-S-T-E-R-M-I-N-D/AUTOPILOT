// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The project page's "Operator evaluation" panel — the evolution view of the
 * human-vs-agent evaluation (backlog J checkbox 5): one bar per trailing
 * Sun-start week of operator approve/reject verdicts, bar height = approval
 * rate, verdict-free weeks render as gaps (never a fake 0%), summary + trend
 * direction in the legend and the group aria-label.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderShell, clientJs } from '../../src/web/shell.js';
import { evaluationTrendWeekTip } from '../../src/web/evaluation-trend.js';

const NOW = Date.UTC(2026, 7, 12, 12, 0, 0); // Wed 2026-08-12 12:00 UTC

function projectWith(evaluationLabelDayCounts?: unknown[]) {
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
    firings: 0,
    shipped: 0,
    cost: 0.1,
    tokensIn: 10,
    tokensOut: 5,
    shipRate: 0.5,
    openFindings: 0,
    gauge: { critical: 0, high: 0, medium: 0, low: 0 },
    lastActivityAt: NOW,
    flightLog: [],
    activity: [],
    tasks: [],
    ...(evaluationLabelDayCounts ? { evaluationLabelDayCounts } : {}),
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

describe('the per-week bar tip text', () => {
  it('reads approved/rejected tallies and the rounded rate for a verdict-carrying week', () => {
    expect(
      evaluationTrendWeekTip({ key: '2026-08-09', approved: 3, rejected: 1, rate: 0.75 }),
    ).toBe('week of 2026-08-09: 3 approved, 1 rejected — 75% approval');
  });

  it('reads 0% for an all-rejected week — the stub bar still gets an honest label', () => {
    expect(evaluationTrendWeekTip({ key: '2026-05-24', approved: 0, rejected: 2, rate: 0 })).toBe(
      'week of 2026-05-24: 0 approved, 2 rejected — 0% approval',
    );
  });
});

describe('the project-page operator evaluation trend panel', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('does not render at all when the project has no operator verdicts', async () => {
    boot(projectWith());
    await vi.advanceTimersByTimeAsync(1);

    expect(document.querySelector('.eval-trend-wrap')).toBeNull();
  });

  it('renders one bar per verdict-carrying week — verdict-free weeks are gaps, not 0% bars', async () => {
    // NOW is Wed 2026-08-12 → last Sun-start week is 2026-08-09; the 12-week
    // window opens on Sun 2026-05-24. Two weeks carry verdicts; ten do not.
    boot(
      projectWith([
        { day: '2026-05-25', approved: 0, rejected: 2 },
        { day: '2026-08-10', approved: 3, rejected: 1 },
      ]),
    );
    await vi.advanceTimersByTimeAsync(1);

    const bars = document.querySelectorAll('.eval-trend-grid .eval-trend-bar');
    expect(bars.length).toBe(2);
    const last = document.querySelector('[data-week="2026-08-09"]');
    expect(last).not.toBeNull();
    expect(last!.getAttribute('data-tip')).toBe(
      'week of 2026-08-09: 3 approved, 1 rejected — 75% approval',
    );
    expect(last!.classList.contains('eval-approve')).toBe(true);
  });

  it('keeps an all-rejected week visible as a red stub — a 0% week must not vanish like a gap', async () => {
    boot(
      projectWith([
        { day: '2026-05-25', approved: 0, rejected: 2 },
        { day: '2026-08-10', approved: 3, rejected: 1 },
      ]),
    );
    await vi.advanceTimersByTimeAsync(1);

    const stub = document.querySelector('[data-week="2026-05-24"]');
    expect(stub).not.toBeNull();
    expect(stub!.classList.contains('eval-reject')).toBe(true);
    expect(Number(stub!.getAttribute('height'))).toBeGreaterThan(0);
  });

  it('carries the summary + trend direction in the group aria-label and the legend', async () => {
    boot(
      projectWith([
        { day: '2026-05-25', approved: 0, rejected: 2 },
        { day: '2026-08-10', approved: 3, rejected: 1 },
      ]),
    );
    await vi.advanceTimersByTimeAsync(1);

    const summary = '3 approved, 3 rejected — 50% approval, improving';
    const svg = document.querySelector('.eval-trend-grid');
    expect(svg!.getAttribute('aria-label')).toBe(
      'Operator approval over the last 12 weeks — ' + summary,
    );
    expect(document.querySelector('.eval-trend-legend')!.textContent).toBe(summary);
  });

  it('gives only the first week cell a Tab stop, not one per week (D1 TAB-STOP ROVING follow-on)', async () => {
    // 12-week window, only two weeks carry verdicts — the other ten render as
    // .eval-trend-empty gaps, but every cell (bar or gap) is still one of the
    // 12 rendered rects and must share the same single roving Tab stop.
    boot(
      projectWith([
        { day: '2026-05-25', approved: 0, rejected: 2 },
        { day: '2026-08-10', approved: 3, rejected: 1 },
      ]),
    );
    await vi.advanceTimersByTimeAsync(1);

    const cells = Array.from(document.querySelectorAll('.eval-trend-grid rect[data-week]'));
    expect(cells.length).toBe(12);
    expect(cells.map((c) => c.getAttribute('tabindex'))).toEqual(['0', ...Array(11).fill('-1')]);
  });

  it('moves the roving tab stop with ArrowRight/ArrowLeft/Home/End across week cells', async () => {
    boot(
      projectWith([
        { day: '2026-05-25', approved: 0, rejected: 2 },
        { day: '2026-08-10', approved: 3, rejected: 1 },
      ]),
    );
    await vi.advanceTimersByTimeAsync(1);

    const cells = Array.from(
      document.querySelectorAll('.eval-trend-grid rect[data-week]'),
    ) as unknown as HTMLElement[];
    const [cell0, cell1] = cells;
    if (!cell0 || !cell1) throw new Error('expected at least 2 week cells');

    cell0.focus();
    cell0.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(cell0.getAttribute('tabindex')).toBe('-1');
    expect(cell1.getAttribute('tabindex')).toBe('0');
    expect(document.activeElement).toBe(cell1);

    cell1.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    expect(cell0.getAttribute('tabindex')).toBe('0');
    expect(cell1.getAttribute('tabindex')).toBe('-1');
    expect(document.activeElement).toBe(cell0);

    const last = cells[cells.length - 1]!;
    cell0.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    expect(cell0.getAttribute('tabindex')).toBe('-1');
    expect(last.getAttribute('tabindex')).toBe('0');
    expect(document.activeElement).toBe(last);
  });
});

// UX weakness sweep cut 3/3 (epic 0015, board web-mtju8ekq-dlpe9n): the
// trend chart (`.eval-trend-wrap`) and its stat-tile summary
// (`.evolution-panel`) both surface the exact same approval-rate numbers
// under a heading reading "Evolution" — but renderProjectPage() used to
// scatter them across the page (`card`, then DORA/gate-parallel/warm-sessions
// all sat between them), so the summary read as an unrelated, disconnected
// repeat rather than the chart's own companion tile row. They now render
// back-to-back with a heading that doesn't just repeat "Evolution".
describe('the evolution trend chart and its stat-tile summary render as one unit', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders the stat-tile summary immediately after the trend chart — nothing else between them', async () => {
    boot(projectWith([{ day: '2026-08-10', approved: 3, rejected: 1 }]));
    await vi.advanceTimersByTimeAsync(1);

    const trendWrap = document.querySelector('.eval-trend-wrap');
    expect(trendWrap).not.toBeNull();
    expect(trendWrap!.nextElementSibling?.className).toContain('evolution-panel');
  });

  it("gives the stat-tile summary a distinct heading instead of repeating the chart's own 'Evolution' title", async () => {
    boot(projectWith([{ day: '2026-08-10', approved: 3, rejected: 1 }]));
    await vi.advanceTimersByTimeAsync(1);

    const summaryHeading = document.querySelector('.evolution-panel .evolution-title');
    expect(summaryHeading).not.toBeNull();
    expect(summaryHeading!.textContent).not.toBe('🧬 Evolution');
  });
});
