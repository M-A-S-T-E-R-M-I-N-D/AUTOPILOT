// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * App-wide interactivity audit: the fleet card's severity gauge (`.gauge
 * .seg`) and language bar (`.langbar .langseg`) used to be `aria-hidden`
 * decoration with no per-segment breakdown. They now explain themselves on
 * hover/focus too, like the chips and stats already do.
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
  languages: [
    { language: 'typescript', files: 10, bytes: 3072 },
    { language: 'json', files: 2, bytes: 1024 },
  ],
  topDirs: [],
  hotFiles: [],
  gate: 'js · vitest run',
  backedUp: true,
  firings: 4,
  shipped: 3,
  cost: 0.42,
  tokensIn: 1000,
  tokensOut: 500,
  shipRate: 0.75,
  recentShipRate: 0.8,
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
    firings: 4,
    shipped: 3,
    openFindings: 3,
    cost: 0.42,
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

describe('severity gauge and language bar explain themselves on hover/focus', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('makes every gauge segment keyboard-reachable with a tooltip and accessible label, one roving Tab stop', async () => {
    boot('p1');
    await vi.advanceTimersByTimeAsync(1);

    const segs = Array.from(document.querySelectorAll('.card-gauge .gauge .seg'));
    expect(segs.length).toBe(3); // critical, high, low (medium is 0)
    // Roving tabindex (D1 TAB-STOP ROVING, board web-mtd1wyte-ssntzi): only the
    // first segment is a Tab stop, not one per severity bucket.
    expect(segs.map((seg) => seg.getAttribute('tabindex'))).toEqual(['0', '-1', '-1']);
    for (const seg of segs) {
      expect(seg.getAttribute('role')).toBe('img');
      expect(seg.getAttribute('data-tip')).toBeTruthy();
      expect(seg.getAttribute('aria-label')).toBeTruthy();
    }
  });

  it('moves the roving tab stop with ArrowRight/ArrowLeft/Home/End, not a fresh Tab stop per segment', async () => {
    boot('p1');
    await vi.advanceTimersByTimeAsync(1);

    const segs = Array.from(document.querySelectorAll('.card-gauge .gauge .seg')) as HTMLElement[];
    const [seg0, seg1, seg2] = segs;
    if (!seg0 || !seg1 || !seg2) throw new Error('expected 3 segments');

    seg0.focus();
    seg0.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(segs.map((s) => s.getAttribute('tabindex'))).toEqual(['-1', '0', '-1']);
    expect(document.activeElement).toBe(seg1);

    seg1.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    expect(segs.map((s) => s.getAttribute('tabindex'))).toEqual(['-1', '-1', '0']);
    expect(document.activeElement).toBe(seg2);

    seg2.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    expect(segs.map((s) => s.getAttribute('tabindex'))).toEqual(['-1', '0', '-1']);
    expect(document.activeElement).toBe(seg1);

    seg1.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    expect(segs.map((s) => s.getAttribute('tabindex'))).toEqual(['0', '-1', '-1']);
    expect(document.activeElement).toBe(seg0);

    // ArrowLeft at the first segment clamps instead of wrapping or throwing.
    seg0.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    expect(segs.map((s) => s.getAttribute('tabindex'))).toEqual(['0', '-1', '-1']);
    expect(document.activeElement).toBe(seg0);
  });

  it('moves the roving tab stop to whichever segment gets mouse/programmatic focus', async () => {
    boot('p1');
    await vi.advanceTimersByTimeAsync(1);

    const segs = Array.from(document.querySelectorAll('.card-gauge .gauge .seg')) as HTMLElement[];
    const seg1 = segs[1];
    if (!seg1) throw new Error('expected a second segment');

    seg1.focus();
    expect(segs.map((s) => s.getAttribute('tabindex'))).toEqual(['-1', '0', '-1']);
  });

  it('makes every language bar segment keyboard-reachable with a tooltip and accessible label, one roving Tab stop', async () => {
    boot('p1');
    await vi.advanceTimersByTimeAsync(1);

    document.querySelector<HTMLDetailsElement>('.detail')!.open = true;
    const segs = Array.from(document.querySelectorAll('.langbar .langseg'));
    expect(segs.length).toBe(2);
    // Roving tabindex (D1 TAB-STOP ROVING, board web-mtd1wyte-ssntzi): only the
    // first language segment is a Tab stop, not one per language.
    expect(segs.map((seg) => seg.getAttribute('tabindex'))).toEqual(['0', '-1']);
    for (const seg of segs) {
      expect(seg.getAttribute('role')).toBe('img');
      expect(seg.getAttribute('data-tip')).toBeTruthy();
      expect(seg.getAttribute('aria-label')).toBeTruthy();
    }
  });

  it('moves the language-bar roving tab stop with ArrowRight/ArrowLeft/Home/End, not a fresh Tab stop per segment', async () => {
    boot('p1');
    await vi.advanceTimersByTimeAsync(1);
    document.querySelector<HTMLDetailsElement>('.detail')!.open = true;

    const segs = Array.from(document.querySelectorAll('.langbar .langseg')) as HTMLElement[];
    const [seg0, seg1] = segs;
    if (!seg0 || !seg1) throw new Error('expected 2 language segments');

    seg0.focus();
    seg0.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(segs.map((s) => s.getAttribute('tabindex'))).toEqual(['-1', '0']);
    expect(document.activeElement).toBe(seg1);

    seg1.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    expect(segs.map((s) => s.getAttribute('tabindex'))).toEqual(['0', '-1']);
    expect(document.activeElement).toBe(seg0);

    // ArrowLeft at the first segment clamps instead of wrapping or throwing.
    seg0.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    expect(segs.map((s) => s.getAttribute('tabindex'))).toEqual(['0', '-1']);
    expect(document.activeElement).toBe(seg0);

    seg0.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    expect(segs.map((s) => s.getAttribute('tabindex'))).toEqual(['-1', '0']);
    expect(document.activeElement).toBe(seg1);
  });

  it('moves the language-bar roving tab stop to whichever segment gets mouse/programmatic focus', async () => {
    boot('p1');
    await vi.advanceTimersByTimeAsync(1);
    document.querySelector<HTMLDetailsElement>('.detail')!.open = true;

    const segs = Array.from(document.querySelectorAll('.langbar .langseg')) as HTMLElement[];
    const seg1 = segs[1];
    if (!seg1) throw new Error('expected a second language segment');

    seg1.focus();
    expect(segs.map((s) => s.getAttribute('tabindex'))).toEqual(['-1', '0']);
  });
});
