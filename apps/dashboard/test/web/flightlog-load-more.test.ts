// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The flight log's "Load older firings" button (web-msnf2heh-2znbbu): once
 * "Show all" reveals every row the initial `/api/state` window carried, a
 * project with `flightLogHasMore` offers a real round-trip to `/api/firings`
 * for the next older page — a slice-heavy day must not push firings out of
 * reach with no way back to them.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderShell, clientJs } from '../../src/web/shell.js';

function firing(id: string, at: number) {
  return {
    id,
    item: 'web-abc123',
    kind: 'fix',
    sha: null,
    shipped: true,
    gateResult: null,
    cost: 0.01,
    tokensIn: 10,
    tokensOut: 5,
    turns: 2,
    commitSubject: 'fix: ' + id,
    at,
  };
}

const INITIAL_LOG = Array.from({ length: 10 }, (_, i) => firing('f' + (10 - i), 10 - i));

const PROJECT = {
  id: 'p1',
  slug: 'alpha',
  name: 'Alpha',
  status: 'flying',
  createdAt: 1,
  fileCount: 1,
  totalBytes: 10,
  languages: [],
  topDirs: [],
  hotFiles: [],
  gate: null,
  backedUp: true,
  firings: 12,
  shipped: 12,
  cost: 0.1,
  tokensIn: 10,
  tokensOut: 5,
  shipRate: 1,
  openFindings: 0,
  gauge: { critical: 0, high: 0, medium: 0, low: 0 },
  lastActivityAt: 10,
  flightLog: INITIAL_LOG,
  flightLogHasMore: true,
  activity: [],
  tasks: [],
};

const STATE = {
  generatedAt: 1,
  totals: {
    projects: 1,
    flying: 1,
    needsYou: 0,
    firings: 12,
    shipped: 12,
    openFindings: 0,
    cost: 0.1,
  },
  projects: [PROJECT],
  empty: false,
};

const OLDER_PAGE = {
  entries: [firing('f0', 0)],
  hasMore: false,
};

function boot(): void {
  document.open();
  document.write(renderShell('p1'));
  document.close();
  globalThis.fetch = vi.fn(async (url: string | URL | Request) => {
    if (String(url).startsWith('/api/firings')) {
      return { ok: true, json: async () => OLDER_PAGE } as unknown as Response;
    }
    return { ok: true, json: async () => STATE } as unknown as Response;
  });
  new Function(clientJs())();
}

describe('the flight log "Load older firings" round-trip', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('fetches the next page from /api/firings and appends it once revealed', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);

    const showAll = document.querySelector('[data-flightlog-all]') as HTMLButtonElement | null;
    expect(showAll).not.toBeNull();
    expect(showAll!.textContent).toBe('Show all (10)');
    // Not yet visible: the initial window is fully expandable without a
    // network round-trip, so "Load older firings" only appears once expanded.
    expect(document.querySelector('[data-flightlog-more]')).toBeNull();

    showAll!.click();
    await vi.advanceTimersByTimeAsync(10);

    const loadMore = document.querySelector('[data-flightlog-more]') as HTMLButtonElement | null;
    expect(loadMore).not.toBeNull();
    expect(loadMore!.textContent).toBe('Load older firings');

    loadMore!.click();
    await vi.advanceTimersByTimeAsync(10);

    const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
    const firingsCall = fetchMock.mock.calls.find((c) => String(c[0]).startsWith('/api/firings'));
    expect(firingsCall?.[0]).toBe('/api/firings?project=p1&offset=10');

    await vi.advanceTimersByTimeAsync(10);
    const rows = document.querySelectorAll('.flightlog .flight');
    expect(rows.length).toBe(11); // 10 initial + 1 fetched page
    // The fetched page said hasMore: false — the button must not linger.
    expect(document.querySelector('[data-flightlog-more]')).toBeNull();
    await vi.advanceTimersByTimeAsync(5000);
  });
});
