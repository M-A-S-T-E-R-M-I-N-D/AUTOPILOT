// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The worker card's per-firing PROGRESS bar (a slice of FLIGHT PROGRESS + ETA,
 * web-msnt5ccp-9bx2ix): elapsed time for the live firing against this
 * project's own average past-firing duration. Silent with no duration
 * history yet — a fresh project has nothing honest to compare against, so
 * the bar simply doesn't render rather than fabricating a baseline. Drives
 * the REAL client bundle in jsdom (same pattern as live-worker-turns.test.ts).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderShell, clientJs } from '../../src/web/shell.js';

const NOW = 1_700_000_000_000;

const BASE_PROJECT = {
  id: 'p1',
  slug: 'alpha',
  name: 'Alpha',
  status: 'flying',
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
  cost: 0,
  tokensIn: 0,
  tokensOut: 0,
  shipRate: null,
  openFindings: 0,
  gauge: { critical: 0, high: 0, medium: 0, low: 0 },
  lastActivityAt: null,
  activity: [
    {
      tool: 'Bash',
      target: 'pnpm run test',
      kind: 'command',
      phase: 'gate',
      at: NOW - 60_000,
      firingId: 'f1',
      model: 'sonnet',
      tokensIn: 500,
      tokensOut: 40,
    },
  ],
  flightLog: [],
  tasks: [],
};

function stateWith(project: Record<string, unknown>) {
  return {
    generatedAt: 1,
    totals: {
      projects: 1,
      flying: 1,
      needsYou: 0,
      firings: 0,
      shipped: 0,
      openFindings: 0,
      cost: 0,
    },
    projects: [{ ...BASE_PROJECT, ...project }],
    empty: false,
  };
}

describe('the live worker card per-firing progress bar', () => {
  let current: ReturnType<typeof stateWith>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    document.open();
    document.write(renderShell());
    document.close();
    globalThis.fetch = vi.fn(
      async () => ({ ok: true, json: async () => current }) as unknown as Response,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('does not render with no duration history', async () => {
    current = stateWith({ flightLog: [] });
    new Function(clientJs())();
    await vi.advanceTimersByTimeAsync(1);

    expect(document.querySelector('.live-progress')).toBeNull();
  });

  it('shows elapsed vs. the average of past firings, as a percentage', async () => {
    current = stateWith({
      flightLog: [
        { id: 'p1:firing-1', durationMs: 100_000 },
        { id: 'p1:firing-2', durationMs: 60_000 },
      ],
    });
    new Function(clientJs())();
    await vi.advanceTimersByTimeAsync(1);

    // elapsed 60s against an 80s average = 75%
    const bar = document.querySelector('.live-progress');
    expect(bar).not.toBeNull();
    expect(bar?.getAttribute('role')).toBe('progressbar');
    expect(bar?.getAttribute('aria-valuemin')).toBe('0');
    expect(bar?.getAttribute('aria-valuemax')).toBe('100');
    expect(bar?.getAttribute('aria-valuenow')).toBe('75');
    expect(bar?.getAttribute('aria-label')).toContain('1m 0s of an average 1m 20s');
    expect(bar?.getAttribute('aria-label')).toContain('75%');
    expect(bar?.classList.contains('live-progress-over')).toBe(false);

    const label = document.querySelector('.live-worker-progress-label');
    expect(label?.textContent).toContain('1m 0s of an average 1m 20s');
  });

  it('explains the progress label on hover+focus like its worker-card siblings', async () => {
    current = stateWith({
      flightLog: [
        { id: 'p1:firing-1', durationMs: 100_000 },
        { id: 'p1:firing-2', durationMs: 60_000 },
      ],
    });
    new Function(clientJs())();
    await vi.advanceTimersByTimeAsync(1);

    const label = document.querySelector('.live-worker-progress-label');
    // D1 TAB-STOP ROVING: one Tab stop per live-worker card (its first line);
    // the arrow keys reach this label (live-worker-roving-tabindex.test.ts).
    expect(label?.getAttribute('tabindex')).toBe('-1');
    expect(label?.getAttribute('data-tip')).toContain('average duration of past firings');
    expect(label?.getAttribute('aria-label')).toBe(label?.textContent);
  });

  it('calls out an overrun instead of clipping the label at 100%', async () => {
    current = stateWith({
      flightLog: [{ id: 'p1:firing-1', durationMs: 10_000 }],
    });
    new Function(clientJs())();
    await vi.advanceTimersByTimeAsync(1);

    const bar = document.querySelector('.live-progress');
    expect(bar?.getAttribute('aria-valuenow')).toBe('100'); // capped for the ARIA range
    expect(bar?.getAttribute('aria-label')).toContain('running longer than usual');
    expect(bar?.classList.contains('live-progress-over')).toBe(true);
  });

  it("is keyboard-reachable through the card's roving Tab stop", async () => {
    current = stateWith({
      flightLog: [{ id: 'p1:firing-1', durationMs: 100_000 }],
    });
    new Function(clientJs())();
    await vi.advanceTimersByTimeAsync(1);

    // D1 TAB-STOP ROVING: the bar is the card's LAST line, so it sits at -1
    // and End from the card's single Tab stop lands on it
    // (live-worker-roving-tabindex.test.ts).
    const bar = document.querySelector('.live-progress');
    expect(bar?.getAttribute('tabindex')).toBe('-1');
  });
});
