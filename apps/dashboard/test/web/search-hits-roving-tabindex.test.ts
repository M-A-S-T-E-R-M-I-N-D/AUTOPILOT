// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * D1 TAB-STOP ROVING (epic 0015, board web-mtd1wyte-ssntzi): the search-hits
 * list gave every result its own unconditional Tab stop — an N-result search
 * cost the keyboard N stops to pass through, the same anti-pattern already
 * fixed for the #live-workers strip (shell.ts). Only the first hit is a real
 * Tab stop now; Up/Down/Home/End move it, matching the live-workers pattern.
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

const HITS = [
  { path: 'src/foo.ts', language: 'typescript', score: 3.256, snippet: 'const foo' },
  { path: 'src/bar.ts', language: 'typescript', score: 2.1, snippet: 'const bar' },
  { path: 'src/baz.ts', language: 'typescript', score: 1.4, snippet: 'const baz' },
];

async function boot(): Promise<void> {
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
}

function hits(): HTMLElement[] {
  return Array.from(document.querySelectorAll('.search-hit'));
}

describe('search-hits list uses roving tabindex', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('only the first hit is a real Tab stop; the rest start at -1', async () => {
    await boot();
    const rows = hits();
    expect(rows).toHaveLength(3);
    expect(rows[0]?.getAttribute('tabindex')).toBe('0');
    expect(rows[1]?.getAttribute('tabindex')).toBe('-1');
    expect(rows[2]?.getAttribute('tabindex')).toBe('-1');
  });

  it('ArrowDown moves the Tab stop to the next hit and focuses it', async () => {
    await boot();
    const rows = hits();
    rows[0]?.focus();
    rows[0]?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(rows[0]?.getAttribute('tabindex')).toBe('-1');
    expect(rows[1]?.getAttribute('tabindex')).toBe('0');
    expect(document.activeElement).toBe(rows[1]);
  });

  it('ArrowUp on the first hit stays put (clamped)', async () => {
    await boot();
    const rows = hits();
    rows[0]?.focus();
    rows[0]?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    expect(rows[0]?.getAttribute('tabindex')).toBe('0');
    expect(rows[1]?.getAttribute('tabindex')).toBe('-1');
  });

  it('End jumps to the last hit, Home jumps back to the first', async () => {
    await boot();
    const rows = hits();
    rows[0]?.focus();
    rows[0]?.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    expect(rows[2]?.getAttribute('tabindex')).toBe('0');
    expect(document.activeElement).toBe(rows[2]);
    rows[2]?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    expect(rows[0]?.getAttribute('tabindex')).toBe('0');
    expect(rows[2]?.getAttribute('tabindex')).toBe('-1');
  });

  it('mouse/programmatic focus on a hit also moves the roving Tab stop', async () => {
    await boot();
    const rows = hits();
    rows[2]?.focus();
    expect(rows[0]?.getAttribute('tabindex')).toBe('-1');
    expect(rows[2]?.getAttribute('tabindex')).toBe('0');
  });
});
