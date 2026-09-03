// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * D1 TAB-STOP ROVING (epic 0015, board web-mtd1wyte-ssntzi): the task
 * board row's status pill and title span each gave themselves their own
 * unconditional Tab stop, on top of the informational chips (severity/
 * dimension/etc) already folded into one roving group — the remaining gap
 * called out when that chip fix shipped. The pill, title, and any chips on
 * a row are now ONE roving group; only the pill (first in DOM order) is a
 * real Tab stop, and Left/Right/Home/End move it, same as every other
 * roving group in the shell.
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
  firings: 0,
  shipped: 0,
  cost: 0,
  tokensIn: 0,
  tokensOut: 0,
  shipRate: null,
  openFindings: 0,
  gauge: { critical: 0, high: 0, medium: 0, low: 0 },
  lastActivityAt: null,
  flightLog: [],
  activity: [],
  tasks: [
    {
      id: 't1',
      title: 'Ship the thing',
      status: 'queued',
      source: 'dashboard',
      severity: 'high',
      dimension: 'accessibility',
      focus: false,
      priority: null,
      at: 1,
    },
  ],
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

function boot(): void {
  document.open();
  document.write(renderShell('p1'));
  document.close();
  globalThis.fetch = vi.fn(
    async () => ({ ok: true, json: async () => STATE }) as unknown as Response,
  );
  new Function(clientJs())();
}

function rowItems(): HTMLElement[] {
  return Array.from(document.querySelectorAll('.task[data-task-id="t1"] [tabindex]'));
}

describe('task row pill/title/chips use one roving tabindex group', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('only the status pill (first in DOM order) is a real Tab stop', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);

    const items = rowItems();
    // pill, title, severity chip, dimension chip
    expect(items.length).toBeGreaterThanOrEqual(4);
    expect(items[0]?.className).toMatch(/^pill task-/);
    expect(items[0]?.getAttribute('tabindex')).toBe('0');
    for (const item of items.slice(1)) {
      expect(item.getAttribute('tabindex')).toBe('-1');
    }
  });

  it('ArrowRight walks the Tab stop from the pill to the title to the chips', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);

    const items = rowItems();
    (items[0] as HTMLElement).focus();
    items[0]?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(items[0]?.getAttribute('tabindex')).toBe('-1');
    expect(items[1]?.getAttribute('tabindex')).toBe('0');
    expect(document.activeElement).toBe(items[1]);
    expect(items[1]?.className).toBe('task-title');
  });

  it('End jumps to the last chip, Home jumps back to the pill', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);

    const items = rowItems();
    (items[0] as HTMLElement).focus();
    items[0]?.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    const last = items.length - 1;
    expect(items[last]?.getAttribute('tabindex')).toBe('0');
    expect(document.activeElement).toBe(items[last]);
    items[last]?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    expect(items[0]?.getAttribute('tabindex')).toBe('0');
    expect(items[last]?.getAttribute('tabindex')).toBe('-1');
  });
});
