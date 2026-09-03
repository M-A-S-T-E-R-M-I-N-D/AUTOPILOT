// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * App-wide interactivity audit v2 (web-msm66jlc-gm4oom): the detail panel's
 * "Flight log" section header rendered with zero explanation, unlike its
 * sibling "Hot files" header — the reader has no hint that rows expand on
 * click, or that consecutive same-task slices collapse into one group row.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderShell, clientJs } from '../../src/web/shell.js';

const PROJECT = {
  id: 'p1',
  slug: 'alpha',
  name: 'Alpha',
  status: 'idle',
  createdAt: 1,
  fileCount: 2,
  totalBytes: 100,
  languages: [],
  topDirs: [],
  hotFiles: [],
  gate: null,
  backedUp: false,
  firings: 1,
  shipped: 1,
  cost: 0.12,
  tokensIn: 0,
  tokensOut: 0,
  shipRate: 1,
  openFindings: 0,
  gauge: { critical: 0, high: 0, medium: 0, low: 0 },
  lastActivityAt: 1,
  flightLog: [
    {
      id: 'f1',
      shipped: true,
      item: null,
      cost: 0.12,
      sha: 'abc1234',
      at: Date.now() - 60_000,
      kind: 'fix',
    },
  ],
  activity: [],
  tasks: [],
};

const STATE = {
  generatedAt: 1,
  totals: {
    projects: 1,
    flying: 0,
    needsYou: 0,
    firings: 1,
    shipped: 1,
    openFindings: 0,
    cost: 0.12,
  },
  projects: [PROJECT],
  empty: false,
};

function boot(): void {
  document.open();
  document.write(renderShell('p1'));
  document.close();
  globalThis.fetch = vi.fn(
    async () => ({ ok: true, json: async () => STATE }) as unknown as Response,
  );
  new Function(clientJs())();
}

describe('detail panel flight log header', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('explains rows expand on click and same-task slices group, on hover/focus', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);

    const headings = Array.from(document.querySelectorAll('.detail-h'));
    const heading = headings.find((h) => h.textContent === 'Flight log');
    expect(heading).toBeTruthy();
    expect(heading?.getAttribute('tabindex')).toBe('0');
    expect(heading?.getAttribute('data-tip')).toBe(
      'Every firing this project has flown, newest first — click a row to expand its full story; consecutive slices of the same open task collapse into one group row',
    );
    expect(heading?.getAttribute('aria-label')).toBe(
      'Flight log: every firing this project has flown, newest first, click a row to expand it',
    );
  });
});
