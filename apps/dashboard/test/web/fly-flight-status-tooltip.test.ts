// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * App-wide interactivity audit v2: a live fly-bar row's status span
 * (`.fly-flight-status`, `web/features/fly.ts`'s `flightRow()`) sits right
 * next to the fully-tipped Stop/Pause/Resume buttons and progress bar in the
 * same row, yet rendered with no `data-tip`/`aria-label` of its own — it did
 * not explain what the status implies (running vs. queued vs. paused) on
 * hover/focus like its siblings do.
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

function mockFetch(flyStatus: Record<string, unknown>): void {
  globalThis.fetch = vi.fn(async (input: unknown) => {
    const href = typeof input === 'string' ? input : (input as Request).url;
    if (href.includes('/api/fly')) {
      return { ok: true, json: async () => flyStatus } as unknown as Response;
    }
    return { ok: true, json: async () => FLEET_STATE } as unknown as Response;
  }) as unknown as typeof fetch;
}

describe('fly-flight status span explains itself on hover/focus', () => {
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

  it('makes a running row status keyboard-reachable with a tooltip and accessible label', async () => {
    mockFetch({
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
    });
    new Function(clientJs())();
    await vi.advanceTimersByTimeAsync(1);

    const status = document.querySelector('.fly-flight-status');
    expect(status).not.toBeNull();
    expect(status?.getAttribute('tabindex')).toBe('0');
    expect(status?.getAttribute('data-tip')).toBeTruthy();
    expect(status?.getAttribute('aria-label')).toBeTruthy();
  });

  it('gives a queued row status a distinct tooltip explaining it starts automatically', async () => {
    mockFetch({
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
    });
    new Function(clientJs())();
    await vi.advanceTimersByTimeAsync(1);

    const status = document.querySelector('.fly-flight-status');
    expect(status?.getAttribute('data-tip')).toContain('Queued');
    expect(status?.getAttribute('tabindex')).toBe('0');
  });

  it('gives a paused row status a distinct tooltip explaining Resume is required', async () => {
    mockFetch({
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
    });
    new Function(clientJs())();
    await vi.advanceTimersByTimeAsync(1);

    const status = document.querySelector('.fly-flight-status');
    expect(status?.getAttribute('data-tip')).toContain('Resume');
    expect(status?.getAttribute('tabindex')).toBe('0');
  });
});
