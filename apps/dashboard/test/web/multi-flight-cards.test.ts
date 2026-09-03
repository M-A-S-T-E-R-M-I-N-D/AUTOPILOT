// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Multi-flight fly bar (epic slice 4/6, docs/epics/0001-parallel-flights.md):
 * once `/api/fly`'s `flights` array is present (a real FlightRunnerRegistry,
 * epic slice 3/6 — apps/dashboard/src/flight/registry.ts), every live folder
 * gets its own row with its own Stop/Pause (or Resume), and the launch
 * controls stop globally locking on ANY running flight — only the TYPED
 * folder's own state disables "Fly it". A FlightApi without `flights` (the
 * older single-flight shape) must render byte-identical to before this slice
 * — see the legacy-shape case below. Drives the REAL client bundle in jsdom
 * (same pattern as flight-total-progress.test.ts).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderShell, clientJs } from '../../src/web/shell.js';

const NOW = 1_700_000_000_000;

const FLEET_STATE = {
  generatedAt: 1,
  totals: { projects: 0, flying: 0, needsYou: 0, firings: 0, shipped: 0, openFindings: 0, cost: 0 },
  projects: [] as unknown[],
  empty: true,
};

interface RecordedCall {
  readonly href: string;
  readonly method: string;
  readonly body: Record<string, unknown> | null;
}

function mockFetch(flyStatus: Record<string, unknown>, calls: RecordedCall[]): void {
  globalThis.fetch = vi.fn(async (input: unknown, init?: RequestInit) => {
    const href = typeof input === 'string' ? input : (input as Request).url;
    const method = (init && init.method) || 'GET';
    if (href.includes('/api/fly')) {
      if (method === 'GET') {
        return { ok: true, json: async () => flyStatus } as unknown as Response;
      }
      calls.push({
        href,
        method,
        body:
          init && typeof init.body === 'string'
            ? (JSON.parse(init.body) as Record<string, unknown>)
            : null,
      });
      if (href.endsWith('/stop'))
        return { ok: true, json: async () => ({ stopping: true }) } as unknown as Response;
      if (href.endsWith('/pause'))
        return { ok: true, json: async () => ({ pausing: true }) } as unknown as Response;
      return {
        ok: true,
        json: async () => ({ started: true, status: { running: true } }),
      } as unknown as Response;
    }
    return { ok: true, json: async () => FLEET_STATE } as unknown as Response;
  }) as unknown as typeof fetch;
}

describe('multi-flight fly bar (epic slice 4/6)', () => {
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

  it('renders one row per live folder from `flights`, each with its own status text', async () => {
    mockFetch(
      {
        flights: [
          {
            running: true,
            folder: '/work/a',
            firings: 2,
            paused: false,
            startedAt: NOW,
            totalBudgetUsd: null,
            pid: 1,
          },
          {
            running: true,
            folder: '/work/b',
            firings: null,
            paused: false,
            startedAt: NOW,
            totalBudgetUsd: 20,
            pid: 2,
          },
        ],
      },
      [],
    );
    new Function(clientJs())();
    await vi.advanceTimersByTimeAsync(1);

    const rows = document.querySelectorAll('.fly-flight');
    expect(rows).toHaveLength(2);
    expect(rows[0]?.textContent).toContain('/work/a');
    expect(rows[0]?.textContent).toContain('2 firing(s)');
    expect(rows[1]?.textContent).toContain('/work/b');
    expect(rows[1]?.textContent).toContain('up to $20 total');
  });

  it('tags a fleet-watchdog-initiated row so an operator can tell why it started flying (web-msqhh7kh-ptjodv)', async () => {
    mockFetch(
      {
        flights: [
          {
            running: true,
            folder: '/work/a',
            firings: 1,
            paused: false,
            startedAt: NOW,
            totalBudgetUsd: null,
            pid: 1,
            initiatedBy: 'fleet-watchdog',
          },
          {
            running: true,
            folder: '/work/b',
            firings: 1,
            paused: false,
            startedAt: NOW,
            totalBudgetUsd: null,
            pid: 2,
            initiatedBy: 'operator',
          },
        ],
      },
      [],
    );
    new Function(clientJs())();
    await vi.advanceTimersByTimeAsync(1);

    const rows = document.querySelectorAll('.fly-flight');
    expect(rows[0]?.textContent).toContain('(fleet-watchdog)');
    expect(rows[1]?.textContent).not.toContain('fleet-watchdog');
  });

  it('never globally locks the path field — a DIFFERENT folder stays typeable while one flies', async () => {
    mockFetch(
      {
        flights: [
          {
            running: true,
            folder: '/work/a',
            firings: 2,
            paused: false,
            startedAt: NOW,
            totalBudgetUsd: null,
            pid: 1,
          },
        ],
      },
      [],
    );
    new Function(clientJs())();
    await vi.advanceTimersByTimeAsync(1);

    const folderEl = document.getElementById('fly-folder') as HTMLInputElement;
    const goEl = document.getElementById('fly-go') as HTMLButtonElement;
    expect(folderEl.disabled).toBe(false);
    expect(goEl.disabled).toBe(false);
    expect(goEl.textContent).toBe('Fly it');
  });

  it('disables Fly it only once the TYPED folder itself is already running', async () => {
    mockFetch(
      {
        flights: [
          {
            running: true,
            folder: '/work/a',
            firings: 2,
            paused: false,
            startedAt: NOW,
            totalBudgetUsd: null,
            pid: 1,
          },
        ],
      },
      [],
    );
    new Function(clientJs())();
    await vi.advanceTimersByTimeAsync(1);

    const folderEl = document.getElementById('fly-folder') as HTMLInputElement;
    folderEl.value = '/work/a';
    // The go/disabled state re-derives against folderEl.value on the next poll tick.
    await vi.advanceTimersByTimeAsync(3000);

    const goEl = document.getElementById('fly-go') as HTMLButtonElement;
    expect(goEl.disabled).toBe(true);
    expect(goEl.textContent).toBe('Flying…');
  });

  it("a row's Stop button POSTs /api/fly/stop with that row's own folder", async () => {
    const calls: RecordedCall[] = [];
    mockFetch(
      {
        flights: [
          {
            running: true,
            folder: '/work/a',
            firings: 2,
            paused: false,
            startedAt: NOW,
            totalBudgetUsd: null,
            pid: 1,
          },
        ],
      },
      calls,
    );
    new Function(clientJs())();
    await vi.advanceTimersByTimeAsync(1);

    (document.querySelector('.fly-flight-stop') as HTMLButtonElement).click();
    await vi.advanceTimersByTimeAsync(1);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.href).toContain('/api/fly/stop');
    expect(calls[0]?.body).toEqual({ folder: '/work/a' });
  });

  it("a row's Pause button POSTs /api/fly/pause with that row's own folder", async () => {
    const calls: RecordedCall[] = [];
    mockFetch(
      {
        flights: [
          {
            running: true,
            folder: '/work/b',
            firings: 1,
            paused: false,
            startedAt: NOW,
            totalBudgetUsd: null,
            pid: 1,
          },
        ],
      },
      calls,
    );
    new Function(clientJs())();
    await vi.advanceTimersByTimeAsync(1);

    (document.querySelector('.fly-flight-pause') as HTMLButtonElement).click();
    await vi.advanceTimersByTimeAsync(1);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.href).toContain('/api/fly/pause');
    expect(calls[0]?.body).toEqual({ folder: '/work/b' });
  });

  it('a paused row offers Resume, which prefills the folder and relaunches it', async () => {
    const calls: RecordedCall[] = [];
    mockFetch(
      {
        flights: [
          {
            running: false,
            folder: '/work/c',
            firings: 1,
            paused: true,
            startedAt: null,
            totalBudgetUsd: null,
            pid: null,
          },
        ],
      },
      calls,
    );
    new Function(clientJs())();
    await vi.advanceTimersByTimeAsync(1);

    expect(document.querySelector('.fly-flight')?.textContent).toContain('Paused /work/c');
    (document.querySelector('.fly-flight-resume') as HTMLButtonElement).click();

    expect((document.getElementById('fly-folder') as HTMLInputElement).value).toBe('/work/c');
    await vi.advanceTimersByTimeAsync(1);
    const launchCall = calls.find((c) => c.href.endsWith('/api/fly'));
    expect(launchCall).toBeDefined();
    expect(launchCall?.body?.['folder']).toBe('/work/c');
  });

  it('renders a queued folder with a Cancel action and a distinct status line (PARALLEL FLIGHTS 5/6)', async () => {
    const calls: RecordedCall[] = [];
    mockFetch(
      {
        flights: [
          {
            running: true,
            folder: '/work/a',
            firings: 1,
            paused: false,
            queued: false,
            startedAt: NOW,
            totalBudgetUsd: null,
            pid: 1,
          },
          {
            running: false,
            folder: '/work/b',
            firings: null,
            paused: false,
            queued: true,
            startedAt: null,
            totalBudgetUsd: null,
            pid: null,
          },
        ],
      },
      calls,
    );
    new Function(clientJs())();
    await vi.advanceTimersByTimeAsync(1);

    const rows = document.querySelectorAll('.fly-flight');
    expect(rows).toHaveLength(2);
    expect(rows[1]?.textContent).toContain('Queued: /work/b');
    expect(rows[1]?.querySelector('.fly-flight-stop')?.textContent).toBe('Cancel');

    (rows[1]?.querySelector('.fly-flight-stop') as HTMLButtonElement).click();
    await vi.advanceTimersByTimeAsync(1);

    const cancelCall = calls.find((c) => c.href.endsWith('/api/fly/stop'));
    expect(cancelCall?.body).toEqual({ folder: '/work/b' });
  });

  it('disables Fly it and shows "Queued…" once the TYPED folder itself is queued', async () => {
    mockFetch(
      {
        flights: [
          {
            running: false,
            folder: '/work/b',
            firings: null,
            paused: false,
            queued: true,
            startedAt: null,
            totalBudgetUsd: null,
            pid: null,
          },
        ],
      },
      [],
    );
    new Function(clientJs())();
    await vi.advanceTimersByTimeAsync(1);

    const folderEl = document.getElementById('fly-folder') as HTMLInputElement;
    folderEl.value = '/work/b';
    await vi.advanceTimersByTimeAsync(3000);

    const goEl = document.getElementById('fly-go') as HTMLButtonElement;
    expect(goEl.disabled).toBe(true);
    expect(goEl.textContent).toBe('Queued…');
  });

  it('a legacy single-flight shape (no `flights`) keeps the old global lock unchanged', async () => {
    mockFetch(
      {
        running: true,
        folder: '/work/only',
        firings: 3,
        paused: false,
        startedAt: NOW,
        totalBudgetUsd: null,
        pid: 9,
      },
      [],
    );
    new Function(clientJs())();
    await vi.advanceTimersByTimeAsync(1);

    expect((document.getElementById('fly-folder') as HTMLInputElement).disabled).toBe(true);
    expect((document.getElementById('fly-go') as HTMLButtonElement).disabled).toBe(true);
    expect(document.querySelectorAll('.fly-flight')).toHaveLength(0);
  });
});
