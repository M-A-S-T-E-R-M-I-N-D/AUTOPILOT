// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The fly bar's TOTAL flight-level progress bar (the other half of
 * web-msnt5ccp-9bx2ix — the live worker card's per-firing progress bar is the
 * first half, see live-worker-progress.test.ts). Real spend and firing count
 * come from firings the flying project landed since the flight's startedAt
 * (only one flight runs at a time, so the flying project IS the one /api/fly
 * describes); the ETA leans on this flight's own average firing duration once
 * one has landed, falling back to the project's full history before that.
 * Drives the REAL client bundle in jsdom (same pattern as
 * live-worker-progress.test.ts).
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
  flightLog: [] as Array<Record<string, unknown>>,
  tasks: [],
};

function fleetStateWith(project: Record<string, unknown>) {
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

function mockFetch(flyStatus: Record<string, unknown> | null, fleetState: unknown) {
  globalThis.fetch = vi.fn(async (input: unknown) => {
    const href = typeof input === 'string' ? input : (input as Request).url;
    if (href.includes('/api/fly')) {
      return { ok: true, json: async () => flyStatus } as unknown as Response;
    }
    return { ok: true, json: async () => fleetState } as unknown as Response;
  });
}

describe('the fly bar TOTAL flight progress bar', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    document.open();
    document.write(renderShell());
    document.close();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('stays hidden when no flight is running', async () => {
    mockFetch(
      {
        running: false,
        folder: null,
        firings: null,
        totalBudgetUsd: null,
        startedAt: null,
        pid: null,
      },
      fleetStateWith({ status: 'registered', flightLog: [] }),
    );
    new Function(clientJs())();
    await vi.advanceTimersByTimeAsync(1);

    expect(document.getElementById('fly-progress-bar')?.hidden).toBe(true);
    expect(document.getElementById('fly-progress-label')?.hidden).toBe(true);
  });

  it('shows spend, firing count vs. ceiling, pct done, and an ETA in fixed-firings mode', async () => {
    mockFetch(
      {
        running: true,
        folder: '/repo',
        firings: 4,
        totalBudgetUsd: null,
        startedAt: NOW - 65_000,
        pid: 123,
        maxTurnsPerFiring: 120,
        minBudgetUsd: 0.5,
      },
      fleetStateWith({
        flightLog: [
          { id: 'p1:firing-1', at: NOW - 60_000, cost: 2.5, durationMs: 100_000 },
          { id: 'p1:firing-2', at: NOW - 30_000, cost: 3.5, durationMs: 60_000 },
        ],
      }),
    );
    new Function(clientJs())();
    await vi.advanceTimersByTimeAsync(1);

    const bar = document.getElementById('fly-progress-bar');
    const label = document.getElementById('fly-progress-label');
    expect(bar?.hidden).toBe(false);
    expect(bar?.getAttribute('role')).toBe('progressbar');
    expect(bar?.getAttribute('aria-valuemin')).toBe('0');
    expect(bar?.getAttribute('aria-valuemax')).toBe('100');
    // 2 of 4 firings landed = 50%
    expect(bar?.getAttribute('aria-valuenow')).toBe('50');
    expect(bar?.getAttribute('tabindex')).toBe('0');
    expect(label?.hidden).toBe(false);
    expect(label?.textContent).toContain('1m 5s elapsed');
    expect(label?.textContent).toContain('2 / 4 firing(s)');
    expect(label?.textContent).toContain('$6.00 so far');
    expect(label?.textContent).toContain('50%');
    // remaining 2 firings * 80s avg duration = 160s = 2m 40s
    expect(label?.textContent).toContain('ETA ~2m 40s');
  });

  it('still shows the bar for a single flight reported through the multi-flight registry shape', async () => {
    // The real server always includes `flights` once the registry backs the
    // FlightApi (api.statusAll exists), even when only one folder is flying —
    // see handleFly in server/server.ts. paint() must not treat "flights is
    // an array" as "ambiguous across N flights" when N is 1.
    mockFetch(
      {
        running: true,
        folder: '/repo',
        firings: 4,
        totalBudgetUsd: null,
        startedAt: NOW - 65_000,
        pid: 123,
        paused: false,
        queued: false,
        initiatedBy: null,
        maxTurnsPerFiring: 120,
        minBudgetUsd: 0.5,
        flights: [
          {
            running: true,
            folder: '/repo',
            firings: 4,
            totalBudgetUsd: null,
            startedAt: NOW - 65_000,
            pid: 123,
            paused: false,
            queued: false,
            initiatedBy: null,
          },
        ],
      },
      fleetStateWith({
        flightLog: [
          { id: 'p1:firing-1', at: NOW - 60_000, cost: 2.5, durationMs: 100_000 },
          { id: 'p1:firing-2', at: NOW - 30_000, cost: 3.5, durationMs: 60_000 },
        ],
      }),
    );
    new Function(clientJs())();
    await vi.advanceTimersByTimeAsync(1);

    const bar = document.getElementById('fly-progress-bar');
    const label = document.getElementById('fly-progress-label');
    expect(bar?.hidden).toBe(false);
    expect(bar?.getAttribute('aria-valuenow')).toBe('50');
    expect(label?.hidden).toBe(false);
    expect(label?.textContent).toContain('2 / 4 firing(s)');
  });

  it('hides the total bar (ambiguous) when more than one flight is live at once', async () => {
    mockFetch(
      {
        running: true,
        folder: '/repo',
        firings: 4,
        totalBudgetUsd: null,
        startedAt: NOW - 65_000,
        pid: 123,
        flights: [
          {
            running: true,
            folder: '/repo',
            firings: 4,
            totalBudgetUsd: null,
            startedAt: NOW - 65_000,
            pid: 123,
            paused: false,
            queued: false,
            initiatedBy: null,
          },
          {
            running: true,
            folder: '/other',
            firings: 2,
            totalBudgetUsd: null,
            startedAt: NOW - 5_000,
            pid: 456,
            paused: false,
            queued: false,
            initiatedBy: null,
          },
        ],
      },
      fleetStateWith({ flightLog: [] }),
    );
    new Function(clientJs())();
    await vi.advanceTimersByTimeAsync(1);

    expect(document.getElementById('fly-progress-bar')?.hidden).toBe(true);
    expect(document.getElementById('fly-progress-label')?.hidden).toBe(true);
  });

  it('shows spend against the total $ target in TOTAL-SPEND mode', async () => {
    mockFetch(
      {
        running: true,
        folder: '/repo',
        firings: 20,
        totalBudgetUsd: 30,
        startedAt: NOW - 65_000,
        pid: 123,
        maxTurnsPerFiring: 120,
        minBudgetUsd: 0.5,
      },
      fleetStateWith({
        flightLog: [
          { id: 'p1:firing-1', at: NOW - 60_000, cost: 3, durationMs: 60_000 },
          { id: 'p1:firing-2', at: NOW - 40_000, cost: 3, durationMs: 60_000 },
          { id: 'p1:firing-3', at: NOW - 20_000, cost: 3, durationMs: 60_000 },
        ],
      }),
    );
    new Function(clientJs())();
    await vi.advanceTimersByTimeAsync(1);

    const bar = document.getElementById('fly-progress-bar');
    const label = document.getElementById('fly-progress-label');
    expect(bar?.hidden).toBe(false);
    // $9 of $30 = 30%
    expect(bar?.getAttribute('aria-valuenow')).toBe('30');
    expect(label?.textContent).toContain('$9.00 of $30 total');
    // avg cost $3/firing, $21 remaining -> 7 more firings * 60s avg = 7m 0s
    expect(label?.textContent).toContain('ETA ~7m 0s');
  });

  it('falls back to the project’s historical average duration before any firing lands this flight', async () => {
    mockFetch(
      {
        running: true,
        folder: '/repo',
        firings: 4,
        totalBudgetUsd: null,
        startedAt: NOW - 10_000,
        pid: 123,
        maxTurnsPerFiring: 120,
        minBudgetUsd: 0.5,
      },
      fleetStateWith({
        flightLog: [{ id: 'p1:firing-0', at: NOW - 1_000_000, cost: 5, durationMs: 50_000 }],
      }),
    );
    new Function(clientJs())();
    await vi.advanceTimersByTimeAsync(1);

    const label = document.getElementById('fly-progress-label');
    expect(label?.textContent).toContain('0 / 4 firing(s)');
    expect(label?.textContent).toContain('$0.00 so far');
    // remaining 4 firings * 50s historical avg = 200s = 3m 20s
    expect(label?.textContent).toContain('ETA ~3m 20s');
  });
});
