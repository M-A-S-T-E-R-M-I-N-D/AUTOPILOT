// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * D1 TAB-STOP ROVING (epic 0015): the FLEET COORDINATION panel
 * (`.coordination-list`, one line per sibling claim / in-flight intent) gave
 * every line's text span its own unconditional `tabindex="0"` — the same
 * "one Tab stop per item" anti-pattern already fixed for the fleet-card
 * gauge, language bar, contribution heatmap, flight-log rows, task-row
 * chips, flight timeline strip, office map, DETECTED BACKLOG rows, flight
 * map nodes, and eval-trend bars. A busy fleet round (10+ lanes, each with a
 * claim and an intent) turned the panel into a long keyboard trap. Only the
 * first line is now a Tab stop; the shared wireRoving() Left/Right/Home/End
 * pattern those widgets already use moves it.
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

const LINES = [
  '- CLAIMED by fleet-2: [t1] Wire up the retry queue',
  '- CLAIMED by fleet-3: [t2] Report unification dialog',
  'sibling autopilot/flight-worktree-fleet-5: last commit "fix: pin the kill switch"',
];

function bootWithCoordination(lines: string[]): void {
  document.open();
  document.write(renderShell('p1'));
  document.close();
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/api/coordination')) {
      return { ok: true, json: async () => ({ lines }) } as unknown as Response;
    }
    return { ok: true, json: async () => STATE } as unknown as Response;
  });
  new Function(clientJs())();
}

function coordinationStops(): HTMLElement[] {
  return Array.from(document.querySelectorAll('.coordination-list [tabindex]'));
}

describe('fleet-coordination lines roving tabindex', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('gives the coordination lines ONE shared Tab stop, not one per line', async () => {
    bootWithCoordination(LINES);
    await vi.advanceTimersByTimeAsync(1);

    const stops = coordinationStops();
    expect(stops.length).toBe(3);
    expect(stops[0]!.getAttribute('tabindex')).toBe('0');
    expect(stops.slice(1).every((n) => n.getAttribute('tabindex') === '-1')).toBe(true);
  });

  it('moves the roving tab stop with ArrowRight/ArrowLeft/Home/End', async () => {
    bootWithCoordination(LINES);
    await vi.advanceTimersByTimeAsync(1);

    const [n0, n1, n2] = coordinationStops();
    if (!n0 || !n1 || !n2) throw new Error('expected 3 coordination lines');

    n0.focus();
    n0.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(document.activeElement).toBe(n1);
    expect(n0.getAttribute('tabindex')).toBe('-1');
    expect(n1.getAttribute('tabindex')).toBe('0');

    n1.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    expect(document.activeElement).toBe(n2);
    expect(n2.getAttribute('tabindex')).toBe('0');

    n2.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    expect(document.activeElement).toBe(n0);
    expect(n0.getAttribute('tabindex')).toBe('0');
  });

  it('moves the roving tab stop to whichever line gets mouse/programmatic focus', async () => {
    bootWithCoordination(LINES);
    await vi.advanceTimersByTimeAsync(1);

    const stops = coordinationStops();
    const n2 = stops[2];
    if (!n2) throw new Error('expected a third coordination line');

    n2.focus();
    expect(stops.map((n) => n.getAttribute('tabindex'))).toEqual(['-1', '-1', '0']);
  });
});
