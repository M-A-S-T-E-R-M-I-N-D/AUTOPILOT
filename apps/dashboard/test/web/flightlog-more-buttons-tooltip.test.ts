// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * App-wide interactivity audit v2: the project detail page's flight-log
 * "Show all (N)"/"Show fewer" toggle and "Load older firings" server
 * round-trip button had no [data-tip]/aria-label, so what each one actually
 * does (reveal locally-held rows vs. fetch older ones from the server)
 * wasn't explained on hover or focus.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderShell, clientJs } from '../../src/web/shell.js';

const FLIGHT_LOG = Array.from({ length: 10 }, (_, i) => ({
  id: 'f' + i,
  shipped: true,
  item: null,
  cost: 0.01,
  sha: 'abc000' + i,
  at: Date.now() - i * 60_000,
  kind: 'fix',
}));

const PROJECT = {
  id: 'p1',
  slug: 'alpha',
  name: 'Alpha',
  status: 'idle',
  createdAt: 1,
  primaryLanguage: 'typescript',
  fileCount: 12,
  totalBytes: 4096,
  languages: [{ language: 'typescript', files: 12, bytes: 4096 }],
  topDirs: [],
  hotFiles: [],
  gate: null,
  backedUp: false,
  firings: 10,
  shipped: 10,
  cost: 0.1,
  tokensIn: 0,
  tokensOut: 0,
  shipRate: 1,
  openFindings: 0,
  gauge: { critical: 0, high: 0, medium: 0, low: 0 },
  lastActivityAt: 1,
  activity: [],
  tasks: [],
  flightLog: FLIGHT_LOG,
  flightLogHasMore: true,
};

const STATE = {
  generatedAt: 1,
  totals: {
    projects: 1,
    flying: 0,
    needsYou: 0,
    firings: 10,
    shipped: 10,
    openFindings: 0,
    cost: 0.1,
  },
  projects: [PROJECT],
  empty: false,
};

function boot(projectId: string): void {
  document.open();
  document.write(renderShell(projectId));
  document.close();
  globalThis.fetch = vi.fn(
    async () => ({ ok: true, json: async () => STATE }) as unknown as Response,
  );
  new Function(clientJs())();
}

describe('the flight-log "more" buttons explain themselves on hover/focus', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('gives "Show all" a data-tip that names what it reveals, and flips to "Show fewer" once open', async () => {
    boot('p1');
    await vi.advanceTimersByTimeAsync(1);

    const toggle = document.querySelector('[data-flightlog-all="p1"]') as HTMLButtonElement | null;
    expect(toggle).not.toBeNull();
    expect(toggle?.textContent).toBe('Show all (10)');
    expect(toggle?.getAttribute('data-tip')).toBe(
      'Reveal all 10 locally-held firings, not just the most recent 8',
    );
    expect(toggle?.getAttribute('data-tip')).toBe(toggle?.getAttribute('aria-label'));

    toggle!.click();
    await vi.advanceTimersByTimeAsync(1);

    const collapsed = document.querySelector(
      '[data-flightlog-all="p1"]',
    ) as HTMLButtonElement | null;
    expect(collapsed?.textContent).toBe('Show fewer');
    expect(collapsed?.getAttribute('data-tip')).toBe('Collapse back to the most recent 8 firings');
    expect(collapsed?.getAttribute('data-tip')).toBe(collapsed?.getAttribute('aria-label'));
  });

  it('gives "Load older firings" a data-tip explaining it is a real server round-trip', async () => {
    boot('p1');
    await vi.advanceTimersByTimeAsync(1);

    const toggle = document.querySelector('[data-flightlog-all="p1"]') as HTMLButtonElement | null;
    toggle!.click();
    await vi.advanceTimersByTimeAsync(1);

    const loadMore = document.querySelector(
      '[data-flightlog-more="p1"]',
    ) as HTMLButtonElement | null;
    expect(loadMore).not.toBeNull();
    const tip =
      'Fetch firings older than what the browser already holds — a real server round-trip, not a local reveal';
    expect(loadMore?.getAttribute('data-tip')).toBe(tip);
    expect(loadMore?.getAttribute('data-tip')).toBe(loadMore?.getAttribute('aria-label'));
  });
});
