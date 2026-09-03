// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * D1 TAB-STOP ROVING follow-on (board web-mtd1wyte-ssntzi): the live-worker
 * card (liveWorkerCard, web/shell.ts) gave every explained line its own Tab
 * stop — callsign chip, phase pill, model chip, narrator, tool + target
 * spans, recent-action count, turn/elapsed line, progress label AND progress
 * bar: up to a dozen stops per flying card, repeated on every flying fleet
 * card and again on the project page. The card is now ONE roving group: only
 * its first line is a Tab stop and the shared wireRoving() handlers move it
 * with Left/Right/Home/End and follow mouse/programmatic focus, scoped per
 * card so End on one flying project never jumps into the next.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderShell, clientJs } from '../../src/web/shell.js';

const NOW = 1_700_000_000_000;

function flyingProject(id: string, name: string, firingId: string) {
  return {
    id,
    slug: name.toLowerCase(),
    name,
    status: 'flying',
    createdAt: 1,
    fileCount: 2,
    totalBytes: 100,
    languages: [],
    topDirs: [],
    hotFiles: [],
    gate: null,
    backedUp: false,
    firings: 2,
    shipped: 2,
    cost: 0,
    tokensIn: 0,
    tokensOut: 0,
    shipRate: 1,
    openFindings: 0,
    gauge: { critical: 0, high: 0, medium: 0, low: 0 },
    lastActivityAt: null,
    activity: [
      {
        tool: 'Bash',
        target: 'pnpm run test',
        kind: 'command',
        phase: 'gate',
        at: NOW - 60_000,
        firingId,
        model: 'claude-sonnet-5',
        tokensIn: 500,
        tokensOut: 40,
      },
    ],
    // Two finished firings with durations so the card also renders its
    // progress label + progress bar — the fullest card shape.
    flightLog: [
      { id: id + ':firing-1', durationMs: 100_000 },
      { id: id + ':firing-2', durationMs: 60_000 },
    ],
    tasks: [],
  };
}

const STATE = {
  generatedAt: 1,
  totals: {
    projects: 2,
    flying: 2,
    needsYou: 0,
    firings: 4,
    shipped: 4,
    openFindings: 0,
    cost: 0,
  },
  projects: [flyingProject('p1', 'Alpha', 'f1'), flyingProject('p2', 'Beta', 'f2')],
  empty: false,
};

function boot(): void {
  document.open();
  document.write(renderShell());
  document.close();
  globalThis.fetch = vi.fn(
    async () => ({ ok: true, json: async () => STATE }) as unknown as Response,
  );
  new Function(clientJs())();
}

function cardItems(card: Element): HTMLElement[] {
  return Array.from(card.querySelectorAll('[tabindex]')) as HTMLElement[];
}

function tabindexes(items: Element[]): (string | null)[] {
  return items.map((i) => i.getAttribute('tabindex'));
}

function key(target: Element, k: string): void {
  target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
}

describe('the live-worker card uses one roving Tab stop instead of one per line', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('seeds only the first line of each flying card as a Tab stop', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);

    const cards = Array.from(document.querySelectorAll('.live-worker'));
    expect(cards).toHaveLength(2);
    for (const card of cards) {
      const items = cardItems(card);
      // callsign, phase, model, narrator, tool, target, count, turns,
      // progress label, progress bar — the whole explained surface.
      expect(items.length).toBeGreaterThanOrEqual(10);
      expect(items[0]?.classList.contains('live-callsign')).toBe(true);
      expect(items[items.length - 1]?.classList.contains('live-progress')).toBe(true);
      expect(tabindexes(items)).toEqual(['0', ...items.slice(1).map(() => '-1')]);
    }
  });

  it('moves the stop with ArrowRight/ArrowLeft/Home/End inside the card, never into the next flying card', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);

    const [first, second] = Array.from(document.querySelectorAll('.live-worker'));
    if (!first || !second) throw new Error('expected two flying cards');
    const items = cardItems(first);
    const [callsign, phase] = items;
    const last = items[items.length - 1];
    if (!callsign || !phase || !last) throw new Error('expected at least callsign + phase + bar');

    callsign.focus();
    key(callsign, 'ArrowRight');
    expect(document.activeElement).toBe(phase);
    expect(tabindexes(items)).toEqual(items.map((i) => (i === phase ? '0' : '-1')));

    key(phase, 'End');
    expect(document.activeElement).toBe(last);
    expect(last.getAttribute('role')).toBe('progressbar');

    // End on the last item stays put — it never leaks into the next card.
    key(last, 'ArrowRight');
    expect(document.activeElement).toBe(last);

    key(last, 'Home');
    expect(document.activeElement).toBe(callsign);
    key(callsign, 'ArrowLeft');
    expect(document.activeElement).toBe(callsign);

    // The second flying card's own seeding is untouched throughout.
    const secondItems = cardItems(second);
    expect(tabindexes(secondItems)).toEqual(['0', ...secondItems.slice(1).map(() => '-1')]);
  });

  it('moves the stop to whichever line gets mouse/programmatic focus', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);

    const card = document.querySelector('.live-worker');
    if (!card) throw new Error('expected a flying card');
    const items = cardItems(card);
    const turns = items.find((i) => i.classList.contains('live-worker-turns'));
    if (!turns) throw new Error('expected the turn/elapsed line');

    turns.focus();
    expect(tabindexes(items)).toEqual(items.map((i) => (i === turns ? '0' : '-1')));
  });

  it('leaves the fleet-wide #live-workers strip (its own roving group) alone', async () => {
    boot();
    await vi.advanceTimersByTimeAsync(1);

    const chips = Array.from(document.querySelectorAll('.live-worker-chip'));
    expect(chips.length).toBeGreaterThan(1);
    const before = tabindexes(chips);
    expect(before[0]).toBe('0');

    const card = document.querySelector('.live-worker');
    if (!card) throw new Error('expected a flying card');
    const items = cardItems(card);
    const callsign = items[0];
    if (!callsign) throw new Error('expected the callsign chip');
    callsign.focus();
    key(callsign, 'End');
    expect(document.activeElement).toBe(items[items.length - 1]);
    expect(tabindexes(chips)).toEqual(before);
  });
});
