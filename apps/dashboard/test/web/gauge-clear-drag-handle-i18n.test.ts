// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Two fixed-text tips the previous i18n slice named as next (board
 * web-msnsndki-dz3vn1): the severity gauge's all-clear segment — the single
 * `.seg-clear` span `gaugeBar()` paints when a project has no open findings,
 * whose "No open findings" hover tip doubles as its `role="img"` accessible
 * name — and the task row's decorative drag handle, whose "Drag to reorder"
 * tip is the only text a mouse user gets for it. Both were set imperatively
 * via `setAttribute()` inside the client bundle, invisible to
 * `pnpm i18n:untagged`, and stuck in English under the Hebrew locale.
 *
 * Both carry no live value, so they ride the plain `[data-i18n-tip]` /
 * `[data-i18n-aria]` sweeps rather than a template: `gaugeClearTip` on the
 * segment's tip AND aria (one key, since the tip IS the accessible name),
 * `taskDragTip` on the handle's tip only (it is `aria-hidden`; the ↑/↓
 * buttons are its accessible equivalent, so it gets no aria-label to
 * translate). The card is client-rendered and re-rendered on every fleet
 * tick, so `renderFleet()`'s post-patch `translateDom()` keeps freshly built
 * segments and handles in the current locale, and a mid-session switch
 * flips the existing ones in place.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { STRINGS } from '@autopilot/tokens';
import { renderShell, clientJs } from '../../src/web/shell.js';

const HEBREW_LETTER = /\p{Script=Hebrew}/u;

/** No open findings (so the all-clear segment renders) and two workable
 *  tasks (so the drag handles render). */
const PROJECT = {
  id: 'p1',
  slug: 'alpha',
  name: 'Alpha',
  status: 'flying',
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
  tasks: [
    { id: 't1', title: 'Fix the thing', status: 'queued', source: 'human' },
    { id: 't2', title: 'Ship the other thing', status: 'in_progress', source: 'human' },
  ],
  activity: [],
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

async function boot(): Promise<void> {
  document.open();
  document.write(renderShell('p1'));
  document.close();
  globalThis.fetch = vi.fn(
    async () => ({ ok: true, json: async () => STATE }) as unknown as Response,
  ) as unknown as typeof fetch;
  new Function(clientJs())();
  await vi.advanceTimersByTimeAsync(1);
}

function switchToHebrew(): void {
  (document.querySelector('[data-lang-btn="he"]') as HTMLButtonElement).click();
}

function clearSegment(): HTMLElement {
  return document.querySelector('.gauge .seg-clear') as HTMLElement;
}

function dragHandles(): HTMLElement[] {
  return Array.from(document.querySelectorAll('.task-drag-handle')) as HTMLElement[];
}

describe('severity gauge all-clear segment + task drag handle i18n (board web-msnsndki-dz3vn1)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('paints both in English by default, tagged for the tip/aria sweeps', async () => {
    await boot();
    const seg = clearSegment();

    expect(seg).not.toBeNull();
    expect(seg.getAttribute('data-tip')).toBe('No open findings');
    // The tip IS the accessible name of this role="img" segment.
    expect(seg.getAttribute('aria-label')).toBe('No open findings');
    expect(seg.getAttribute('data-i18n-tip')).toBe('gaugeClearTip');
    expect(seg.getAttribute('data-i18n-aria')).toBe('gaugeClearTip');

    const handles = dragHandles();
    expect(handles.length).toBe(2);
    for (const handle of handles) {
      expect(handle.getAttribute('data-tip')).toBe('Drag to reorder');
      expect(handle.getAttribute('data-i18n-tip')).toBe('taskDragTip');
      // Decorative: no aria-label to translate, and it must stay that way.
      expect(handle.getAttribute('aria-hidden')).toBe('true');
      expect(handle.hasAttribute('aria-label')).toBe(false);
    }
  });

  it('switching to Hebrew repaints the segment tip + accessible name and the handle tips in place', async () => {
    await boot();
    const seg = clearSegment();
    const handles = dragHandles();

    switchToHebrew();

    expect(clearSegment()).toBe(seg);
    expect(seg.getAttribute('data-tip')).toBe(STRINGS.he.gaugeClearTip);
    expect(seg.getAttribute('aria-label')).toBe(STRINGS.he.gaugeClearTip);
    expect(HEBREW_LETTER.test(seg.getAttribute('data-tip') || '')).toBe(true);

    expect(dragHandles()).toEqual(handles);
    for (const handle of handles) {
      expect(handle.getAttribute('data-tip')).toBe(STRINGS.he.taskDragTip);
      expect(HEBREW_LETTER.test(handle.getAttribute('data-tip') || '')).toBe(true);
      expect(handle.hasAttribute('aria-label')).toBe(false);
    }
  });

  it('a page that boots in Hebrew paints both in Hebrew at birth', async () => {
    localStorage.setItem('ap-locale', 'he');
    await boot();

    expect(clearSegment().getAttribute('data-tip')).toBe(STRINGS.he.gaugeClearTip);
    expect(clearSegment().getAttribute('aria-label')).toBe(STRINGS.he.gaugeClearTip);
    for (const handle of dragHandles()) {
      expect(handle.getAttribute('data-tip')).toBe(STRINGS.he.taskDragTip);
    }
  });

  it('keeps the Hebrew rows native — real Hebrew, distinct from English, no stray {slot}', () => {
    for (const key of ['gaugeClearTip', 'taskDragTip'] as const) {
      expect(STRINGS.he[key]).not.toBe(STRINGS.en[key]);
      expect(HEBREW_LETTER.test(STRINGS.he[key])).toBe(true);
      expect(STRINGS.en[key]).not.toMatch(/\{[a-z]+\}/);
      expect(STRINGS.he[key]).not.toMatch(/\{[a-z]+\}/);
    }
  });
});
