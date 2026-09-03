// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Epic 0015 lead #1 (cockpit supervisory control, "whole-view live region"):
 * `#fly-status` is `role="status" aria-live="polite"` (`shell.ts`), and
 * `web/features/fly.ts`'s `poll()` re-fetches `/api/fly` every 3s for as
 * long as a flight runs. `paint()` rewrote its `textContent` unconditionally
 * on every tick, so a screen reader re-announced an UNCHANGED "Flying X — up
 * to $Y total…" every 3 seconds for the flight's whole duration — the exact
 * "stop rewriting live-region content when the value is unchanged" cut the
 * epic names.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderShell, clientJs } from '../../src/web/shell.js';

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

describe('#fly-status stays quiet on an unchanged poll', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('does not touch #fly-status text when a later 3s poll repeats the same status', async () => {
    vi.useFakeTimers();
    document.open();
    document.write(renderShell());
    document.close();
    mockFetch({ running: true, folder: '/work/a', firings: 2, totalBudgetUsd: null });
    new Function(clientJs())();
    await vi.advanceTimersByTimeAsync(1);

    const statusEl = document.getElementById('fly-status')!;
    expect(statusEl.textContent).toContain('Flying');

    let mutated = false;
    const observer = new MutationObserver(() => {
      mutated = true;
    });
    observer.observe(statusEl, { characterData: true, childList: true, subtree: true });

    // The interval poll fires every 3000ms with the identical status payload.
    await vi.advanceTimersByTimeAsync(3000);
    observer.disconnect();

    expect(mutated).toBe(false);
  });

  it('still updates #fly-status text the moment the polled status actually changes', async () => {
    vi.useFakeTimers();
    document.open();
    document.write(renderShell());
    document.close();
    const flyStatus: Record<string, unknown> = {
      running: true,
      folder: '/work/a',
      firings: 2,
      totalBudgetUsd: null,
    };
    mockFetch(flyStatus);
    new Function(clientJs())();
    await vi.advanceTimersByTimeAsync(1);

    const statusEl = document.getElementById('fly-status')!;
    expect(statusEl.textContent).toContain('2 firing(s)');

    flyStatus['firings'] = 5;
    await vi.advanceTimersByTimeAsync(3000);

    expect(statusEl.textContent).toContain('5 firing(s)');
  });
});
