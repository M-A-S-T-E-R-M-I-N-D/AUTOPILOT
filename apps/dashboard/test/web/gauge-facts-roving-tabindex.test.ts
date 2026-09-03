// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * D1 TAB-STOP ROVING (epic 0015, board web-mtd1wyte-ssntzi): the fleet
 * card's gauge label ("N open findings" + "last activity") and the detail
 * panel's facts list ("Gate" + "Backup") each gave every one of their two
 * items its own unconditional Tab stop — the same anti-pattern already fixed
 * for the gauge segments, language bar, and task-row chips. Only the first
 * item in each group is a real Tab stop now; Left/Right/Home/End move it,
 * matching the established wireRoving() pattern.
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
  gate: 'js · vitest run',
  backedUp: true,
  firings: 0,
  shipped: 0,
  cost: 0,
  tokensIn: 0,
  tokensOut: 0,
  shipRate: null,
  openFindings: 3,
  gauge: { critical: 1, high: 1, medium: 0, low: 1 },
  lastActivityAt: 1,
  flightLog: [],
  activity: [],
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
    openFindings: 3,
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

describe('gauge label uses roving tabindex', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('only the first gauge-label span is a real Tab stop; the second starts at -1', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);

    const spans = Array.from(document.querySelectorAll('.card-gauge .gauge-label span'));
    expect(spans).toHaveLength(2);
    expect(spans[0]?.getAttribute('tabindex')).toBe('0');
    expect(spans[1]?.getAttribute('tabindex')).toBe('-1');
  });

  it('ArrowRight moves the Tab stop from the findings label to the activity label', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);

    const spans = Array.from(document.querySelectorAll('.card-gauge .gauge-label span'));
    (spans[0] as HTMLElement).focus();
    spans[0]?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(spans[0]?.getAttribute('tabindex')).toBe('-1');
    expect(spans[1]?.getAttribute('tabindex')).toBe('0');
    expect(document.activeElement).toBe(spans[1]);
  });
});

describe('detail facts list uses roving tabindex', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('only the first facts dd is a real Tab stop; the second starts at -1', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);

    const dds = Array.from(document.querySelectorAll('.facts dd'));
    expect(dds).toHaveLength(2);
    expect(dds[0]?.getAttribute('tabindex')).toBe('0');
    expect(dds[1]?.getAttribute('tabindex')).toBe('-1');
  });

  it('ArrowRight moves the Tab stop from the Gate fact to the Backup fact', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);

    const dds = Array.from(document.querySelectorAll('.facts dd'));
    (dds[0] as HTMLElement).focus();
    dds[0]?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(dds[0]?.getAttribute('tabindex')).toBe('-1');
    expect(dds[1]?.getAttribute('tabindex')).toBe('0');
    expect(document.activeElement).toBe(dds[1]);
  });
});
