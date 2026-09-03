// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * App-wide interactivity audit: a search hit's `language` and `score` fields
 * came back from `/api/search` but were silently dropped — only the bare
 * path + snippet rendered, with no [data-tip] explaining what the number
 * means, unlike every other chip/stat in the shell.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderShell, clientJs } from '../../src/web/shell.js';

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
  firings: 0,
  shipped: 0,
  cost: 0,
  tokensIn: 0,
  tokensOut: 0,
  shipRate: null,
  openFindings: 0,
  gauge: { critical: 0, high: 0, medium: 0, low: 0 },
  lastActivityAt: 1,
  activity: [],
  flightLog: [],
  tasks: [],
};

const STATE = {
  generatedAt: 1,
  totals: {
    projects: 1,
    flying: 0,
    needsYou: 0,
    firings: 0,
    shipped: 0,
    openFindings: 0,
    cost: 0,
  },
  projects: [PROJECT],
  empty: false,
};

const HITS = [{ path: 'src/foo.ts', language: 'typescript', score: 3.256, snippet: 'const foo' }];

function boot(): void {
  document.open();
  document.write(renderShell(''));
  document.close();
  globalThis.fetch = vi.fn(async (url: unknown) => {
    const href = String(url);
    if (href.includes('/api/search')) {
      return { ok: true, json: async () => ({ hits: HITS }) } as unknown as Response;
    }
    return { ok: true, json: async () => STATE } as unknown as Response;
  });
  new Function(clientJs())();
}

describe('search hit rows explain themselves on hover/focus', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('gives every search-hit row a data-tip surfacing language + relevance', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);

    const sel = document.getElementById('search-project') as HTMLSelectElement;
    const qEl = document.getElementById('search-q') as HTMLInputElement;
    const form = document.getElementById('search-form') as HTMLFormElement;
    sel.value = 'p1';
    qEl.value = 'foo';
    form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    await vi.advanceTimersByTimeAsync(1);
    await Promise.resolve();
    await Promise.resolve();

    const hit = document.querySelector('.search-hit');
    expect(hit).toBeTruthy();
    expect(hit?.getAttribute('tabindex')).toBe('0');
    expect(hit?.getAttribute('data-tip')).toBe(
      'typescript — relevance 3.3 (higher matches better)',
    );
    // D1 ATTRIBUTE PAYLOAD (epic 0015): aria-label states the path/
    // language/score facts concisely, not the full data-tip sentence
    // duplicated verbatim.
    expect(hit?.getAttribute('aria-label')).toBe('src/foo.ts: typescript — relevance 3.3');
    expect(hit?.getAttribute('aria-label')).not.toContain('higher matches better');
  });
});
