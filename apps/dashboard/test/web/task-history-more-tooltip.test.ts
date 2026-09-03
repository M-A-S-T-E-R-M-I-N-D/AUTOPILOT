// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * App-wide interactivity audit v2: the project detail page's "Load more done"
 * task-history button (`[data-task-history-more]`) had no [data-tip]/aria-label,
 * so the "showing X of Y" pagination behavior wasn't explained on hover or focus.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderShell, clientJs } from '../../src/web/shell.js';

const CLOSED_TASKS = Array.from({ length: 16 }, (_, i) => ({
  id: 'done' + i,
  title: 'Shipped thing ' + i,
  status: 'done',
  source: 'human',
}));

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
  firings: 0,
  shipped: 0,
  cost: 0,
  tokensIn: 0,
  tokensOut: 0,
  shipRate: null,
  openFindings: 0,
  gauge: { critical: 0, high: 0, medium: 0, low: 0 },
  lastActivityAt: 1,
  flightLog: [],
  tasks: CLOSED_TASKS,
  activity: [],
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

function boot(projectId: string): void {
  document.open();
  document.write(renderShell(projectId));
  document.close();
  globalThis.fetch = vi.fn(
    async () => ({ ok: true, json: async () => STATE }) as unknown as Response,
  );
  new Function(clientJs())();
}

describe('task history "load more" button explains itself on hover/focus', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('gives the load-more button a data-tip matching its aria-label', async () => {
    boot('p1');
    await vi.advanceTimersByTimeAsync(1);

    const btn = document.querySelector('[data-task-history-more="p1"]');
    expect(btn).toBeTruthy();
    expect(btn?.getAttribute('data-tip')).toBe('Reveal 1 more done/deferred tasks');
    expect(btn?.getAttribute('data-tip')).toBe(btn?.getAttribute('aria-label'));
  });
});
