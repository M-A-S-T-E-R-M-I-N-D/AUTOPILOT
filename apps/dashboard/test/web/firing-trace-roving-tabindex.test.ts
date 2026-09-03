// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * D1 TAB-STOP ROVING (board web-mtd1wyte-ssntzi): a "Per-firing trace" row
 * gave its headline, callsign, verdict, event chips, count and timestamp a
 * Tab stop EACH — up to ~8 stops per row on top of the row button itself,
 * the same per-row multiplier the flight-log rows already fixed. One roving
 * stop per row instead (APG roving-tabindex): the headline leads, Left/Right/
 * Home/End walk the fields, and mouse/programmatic focus moves the stop too.
 * Drives the REAL client bundle in jsdom against a mocked /api/state, same
 * pattern as firing-timeline-chips.test.ts.
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
  gate: 'js · vitest run',
  backedUp: true,
  firings: 2,
  shipped: 2,
  cost: 0.42,
  tokensIn: 1000,
  tokensOut: 500,
  shipRate: 1,
  openFindings: 0,
  gauge: { critical: 0, high: 0, medium: 0, low: 0 },
  lastActivityAt: 1,
  tasks: [],
  flightLog: [
    {
      id: 'f2',
      shipped: true,
      item: null,
      completion: null,
      commitSubject: 'fix: bounced off the boundary, then auto-fixed',
      cost: 0.2,
      sha: 'sha0002',
      at: Date.now() - 10_000,
      kind: 'fix',
      gateResult: 'passed',
      guardDenials: 2,
      autoformatRescued: true,
    },
    {
      id: 'f1',
      shipped: true,
      item: null,
      completion: null,
      commitSubject: 'fix: clean firing, no notable events',
      cost: 0.22,
      sha: 'sha0001',
      at: Date.now() - 20_000,
      kind: 'fix',
      gateResult: 'passed',
      guardDenials: 0,
      autoformatRescued: false,
    },
  ],
  activity: [
    { tool: 'Edit', target: 'src/a.ts', kind: 'file', phase: 'do', at: 6, firingId: 'f2' },
    { tool: 'Read', target: 'src/b.ts', kind: 'file', phase: 'orient', at: 5, firingId: 'f2' },
    { tool: 'Edit', target: 'src/c.ts', kind: 'file', phase: 'do', at: 4, firingId: 'f1' },
    { tool: 'Read', target: 'src/d.ts', kind: 'file', phase: 'orient', at: 3, firingId: 'f1' },
  ],
};

const STATE = {
  generatedAt: 1,
  totals: {
    projects: 1,
    flying: 0,
    needsYou: 0,
    firings: 2,
    shipped: 2,
    openFindings: 0,
    cost: 0.42,
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

function rows(): Element[] {
  return Array.from(document.querySelectorAll('.firing-timeline .firing-toggle'));
}

function fieldsOf(row: Element): Element[] {
  return Array.from(row.querySelectorAll('[tabindex]'));
}

function key(el: Element, k: string): void {
  el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
}

describe('roving tabindex on the per-firing trace rows (D1 TAB-STOP ROVING)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('gives each row ONE Tab stop — the headline — not one per field/chip', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);

    const all = rows();
    expect(all.length).toBe(2);
    for (const row of all) {
      const fields = fieldsOf(row);
      // The busy row carries headline + verdict + auto-fixed + guard + count
      // + ago at minimum — the whole point is that they are NOT all stops.
      expect(fields.length).toBeGreaterThanOrEqual(4);
      const stops = fields.filter((f) => f.getAttribute('tabindex') === '0');
      expect(stops.length).toBe(1);
      expect(stops[0]?.classList.contains('firing-headline')).toBe(true);
      expect(fields.filter((f) => f.getAttribute('tabindex') === '-1').length).toBe(
        fields.length - 1,
      );
    }
  });

  it('walks the row with Left/Right and jumps the rim with Home/End', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);

    const row = rows()[0] as Element;
    const fields = fieldsOf(row);
    const first = fields[0] as Element;
    const second = fields[1] as Element;
    const last = fields[fields.length - 1] as Element;

    key(first, 'ArrowRight');
    expect(second.getAttribute('tabindex')).toBe('0');
    expect(first.getAttribute('tabindex')).toBe('-1');

    key(second, 'ArrowLeft');
    expect(first.getAttribute('tabindex')).toBe('0');
    expect(second.getAttribute('tabindex')).toBe('-1');

    key(first, 'End');
    expect(last.getAttribute('tabindex')).toBe('0');
    expect(last.classList.contains('firing-ago')).toBe(true);

    key(last, 'Home');
    expect(first.getAttribute('tabindex')).toBe('0');
  });

  it('clamps at the row rim instead of walking off (or into another row)', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);

    const row = rows()[0] as Element;
    const fields = fieldsOf(row);
    const first = fields[0] as Element;

    key(first, 'ArrowLeft');
    expect(first.getAttribute('tabindex')).toBe('0');

    const last = fields[fields.length - 1] as Element;
    key(first, 'End');
    key(last, 'ArrowRight');
    expect(last.getAttribute('tabindex')).toBe('0');
  });

  it('roves per row: moving in one row leaves the other row untouched', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);

    const [busy, clean] = rows() as [Element, Element];
    key(fieldsOf(busy)[0] as Element, 'ArrowRight');

    const cleanStops = fieldsOf(clean).filter((f) => f.getAttribute('tabindex') === '0');
    expect(cleanStops.length).toBe(1);
    expect(cleanStops[0]?.classList.contains('firing-headline')).toBe(true);
  });

  it('moves the roving stop on direct focus too, so Tab returns where the user left', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);

    const row = rows()[0] as Element;
    const fields = fieldsOf(row);
    const first = fields[0] as Element;
    const last = fields[fields.length - 1] as Element;

    // APG roving-tabindex: mouse/programmatic focus moves the stop as well —
    // focusin is what the delegated handler listens for.
    last.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    expect(last.getAttribute('tabindex')).toBe('0');
    expect(first.getAttribute('tabindex')).toBe('-1');
  });
});
