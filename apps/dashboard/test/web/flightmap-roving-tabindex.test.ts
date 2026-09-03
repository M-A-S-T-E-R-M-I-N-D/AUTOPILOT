// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * D1 TAB-STOP ROVING (epic 0015): the "files in flight" map
 * (`.flightmap .fnode`, one node per file the agent touched this flight)
 * gave every node its own unconditional `tabindex="0"` — the same "one Tab
 * stop per item" anti-pattern already fixed for the fleet-card gauge,
 * language bar, contribution heatmap, flight-log rows, task-row chips,
 * flight timeline strip, office map, and DETECTED BACKLOG rows. A flight
 * touching many files turned the map into a long keyboard trap. Only the
 * first node is now a Tab stop; the shared wireRoving() Left/Right/Home/End
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
  fileCount: 3,
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
  tasks: [],
  activity: [
    { tool: 'Edit', target: 'src/deep/a.ts', kind: 'file', phase: 'do', at: 6, firingId: 'f1' },
    { tool: 'Read', target: 'src/b.ts', kind: 'file', phase: 'orient', at: 5, firingId: 'f1' },
    { tool: 'Read', target: 'src/c.ts', kind: 'file', phase: 'orient', at: 4, firingId: 'f1' },
  ],
};

const STATE = {
  generatedAt: 1,
  totals: {
    projects: 1,
    flying: 1,
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

describe('flight map roving tabindex', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('gives the file nodes ONE shared Tab stop, not one per file', async () => {
    boot('p1');
    await vi.advanceTimersByTimeAsync(1);

    const nodes = Array.from(document.querySelectorAll('.flightmap .fnode'));
    expect(nodes.length).toBe(3);
    expect(nodes[0]!.getAttribute('tabindex')).toBe('0');
    expect(nodes.slice(1).every((n) => n.getAttribute('tabindex') === '-1')).toBe(true);
  });

  it('moves the roving tab stop with ArrowRight/ArrowLeft/Home/End', async () => {
    boot('p1');
    await vi.advanceTimersByTimeAsync(1);

    const nodes = Array.from(document.querySelectorAll('.flightmap .fnode')) as HTMLElement[];
    const [n0, n1, n2] = nodes;
    if (!n0 || !n1 || !n2) throw new Error('expected 3 flight map nodes');

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

  it('moves the roving tab stop to whichever node gets mouse/programmatic focus', async () => {
    boot('p1');
    await vi.advanceTimersByTimeAsync(1);

    const nodes = Array.from(document.querySelectorAll('.flightmap .fnode')) as HTMLElement[];
    const n2 = nodes[2];
    if (!n2) throw new Error('expected a third flight map node');

    n2.focus();
    expect(nodes.map((n) => n.getAttribute('tabindex'))).toEqual(['-1', '-1', '0']);
  });
});
