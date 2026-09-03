// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Epic 0015 lead #1 (cockpit supervisory control, "whole-view live region")
 * names `#updated` (role="status" aria-live="polite") as one of the two
 * per-tick live regions among the every-tick targets, alongside
 * `#fly-status` (fixed separately). `renderFleet()`'s "updated Xs ago" stamp
 * and `refresh()`'s offline branch both rewrote `#updated`'s textContent
 * unconditionally on every poll (every 3s, or every SSE push) even when the
 * computed text was identical to what was already there — a screen reader
 * would re-announce the same "updated 10d ago" (or "offline — retrying…")
 * repeatedly, indefinitely.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderShell, clientJs } from '../../src/web/shell.js';

function makeState(generatedAt: number) {
  return {
    generatedAt,
    totals: {
      projects: 0,
      flying: 0,
      needsYou: 0,
      firings: 0,
      shipped: 0,
      openFindings: 0,
      cost: 0,
    },
    projects: [] as unknown[],
    empty: true,
  };
}

describe('#updated stays quiet on an unchanged poll', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('does not touch #updated text when a later 3s poll rounds to the same "ago" bucket', async () => {
    vi.useFakeTimers();
    const now = Date.now();
    // 10 days old: a 3s tick later still rounds to the same day count.
    const state = makeState(now - 10 * 86400 * 1000);
    globalThis.fetch = vi.fn(
      async () => ({ ok: true, json: async () => state }) as unknown as Response,
    );
    document.open();
    document.write(renderShell());
    document.close();
    new Function(clientJs())();
    await vi.advanceTimersByTimeAsync(1);

    const updated = document.getElementById('updated')!;
    expect(updated.textContent).toBe('updated 10d ago');

    let mutated = false;
    const observer = new MutationObserver(() => {
      mutated = true;
    });
    observer.observe(updated, { characterData: true, childList: true, subtree: true });

    // The fallback poll fires every 3000ms (no EventSource in jsdom).
    await vi.advanceTimersByTimeAsync(3000);
    observer.disconnect();

    expect(mutated).toBe(false);
  });

  it('still updates #updated text the moment the computed "ago" bucket actually changes', async () => {
    vi.useFakeTimers();
    const now = Date.now();
    const state = makeState(now - 10 * 86400 * 1000);
    globalThis.fetch = vi.fn(
      async () => ({ ok: true, json: async () => state }) as unknown as Response,
    );
    document.open();
    document.write(renderShell());
    document.close();
    new Function(clientJs())();
    await vi.advanceTimersByTimeAsync(1);

    const updated = document.getElementById('updated')!;
    expect(updated.textContent).toBe('updated 10d ago');

    state.generatedAt = now;
    await vi.advanceTimersByTimeAsync(3000);

    expect(updated.textContent).toBe('updated 3s ago');
  });

  it('does not re-announce "offline — retrying…" on repeated failed polls', async () => {
    vi.useFakeTimers();
    globalThis.fetch = vi.fn(async () => {
      throw new Error('network down');
    });
    document.open();
    document.write(renderShell());
    document.close();
    new Function(clientJs())();
    await vi.advanceTimersByTimeAsync(1);

    const updated = document.getElementById('updated')!;
    expect(updated.textContent).toBe('offline — retrying…');

    let mutated = false;
    const observer = new MutationObserver(() => {
      mutated = true;
    });
    observer.observe(updated, { characterData: true, childList: true, subtree: true });

    await vi.advanceTimersByTimeAsync(3000);
    observer.disconnect();

    expect(mutated).toBe(false);
  });
});
