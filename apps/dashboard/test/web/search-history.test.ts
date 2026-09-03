// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The search/ask input had no memory of past queries, so every visit started
 * from a blank box. This drives the REAL client bundle through a search
 * submit and an ask click and asserts each remembered query lands in the
 * `#search-history` <datalist> and survives into a fresh page load (backed by
 * localStorage), capped so the list can never grow without bound.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderShell, clientJs } from '../../src/web/shell.js';

const PROJECT = {
  id: 'p1',
  slug: 'alpha',
  name: 'Alpha',
  status: 'flying',
  createdAt: 1,
  fileCount: 2,
  totalBytes: 100,
  languages: [{ language: 'typescript', files: 2, bytes: 100 }],
  topDirs: [{ dir: 'src', files: 2 }],
  hotFiles: ['src/a.ts'],
  gate: 'js · vitest run',
  backedUp: true,
  firings: 1,
  shipped: 1,
  cost: 0.1,
  tokensIn: 10,
  tokensOut: 5,
  shipRate: 1,
  openFindings: 0,
  gauge: { critical: 0, high: 0, medium: 0, low: 0 },
  lastActivityAt: 1,
  flightLog: [],
  activity: [],
  tasks: [],
};

const STATE = {
  generatedAt: 1,
  totals: {
    projects: 1,
    flying: 1,
    needsYou: 0,
    firings: 1,
    shipped: 1,
    openFindings: 0,
    cost: 0.1,
  },
  projects: [PROJECT],
  empty: false,
};

function boot() {
  document.open();
  document.write(renderShell());
  document.close();
  new Function(clientJs())();
}

describe('search history autocomplete', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    globalThis.fetch = vi.fn(async (url: RequestInfo | URL) => {
      if (typeof url === 'string' && url.startsWith('/api/search')) {
        return { ok: true, json: async () => ({ hits: [] }) } as Response;
      }
      if (typeof url === 'string' && url.startsWith('/api/ask')) {
        return { ok: true, json: async () => ({ answer: 'ok', sources: [] }) } as Response;
      }
      return { ok: true, json: async () => STATE } as Response;
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('remembers a submitted search query in the datalist and in localStorage', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);

    const sel = document.getElementById('search-project') as HTMLSelectElement;
    const qEl = document.getElementById('search-q') as HTMLInputElement;
    const form = document.getElementById('search-form') as HTMLFormElement;
    sel.value = 'p1';
    qEl.value = 'find the flight runner';
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await vi.advanceTimersByTimeAsync(1);

    const datalist = document.getElementById('search-history') as HTMLDataListElement;
    const values = Array.from(datalist.options).map((o) => o.value);
    expect(values).toContain('find the flight runner');
    expect(JSON.parse(localStorage.getItem('ap-search-history')!)).toEqual([
      'find the flight runner',
    ]);
  });

  it('remembers an asked question and pre-populates the datalist on the next page load', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);

    const sel = document.getElementById('search-project') as HTMLSelectElement;
    const qEl = document.getElementById('search-q') as HTMLInputElement;
    const askBtn = document.getElementById('ask-go') as HTMLButtonElement;
    sel.value = 'p1';
    qEl.value = 'what does this repo do?';
    askBtn.click();
    await vi.advanceTimersByTimeAsync(1);

    // Simulate a fresh page load — localStorage persists, the DOM does not.
    boot();
    await vi.advanceTimersByTimeAsync(1);

    const datalist = document.getElementById('search-history') as HTMLDataListElement;
    const values = Array.from(datalist.options).map((o) => o.value);
    expect(values).toEqual(['what does this repo do?']);
  });

  it('caps history at 10 entries and moves repeats to the front', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);

    const sel = document.getElementById('search-project') as HTMLSelectElement;
    const qEl = document.getElementById('search-q') as HTMLInputElement;
    const form = document.getElementById('search-form') as HTMLFormElement;
    sel.value = 'p1';

    for (let i = 0; i < 11; i++) {
      qEl.value = 'query ' + i;
      form.dispatchEvent(new Event('submit', { cancelable: true }));
      await vi.advanceTimersByTimeAsync(1);
    }
    qEl.value = 'query 5';
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await vi.advanceTimersByTimeAsync(1);

    const history = JSON.parse(localStorage.getItem('ap-search-history')!) as string[];
    expect(history.length).toBe(10);
    expect(history[0]).toBe('query 5');
    expect(history).not.toContain('query 0');
  });
});
