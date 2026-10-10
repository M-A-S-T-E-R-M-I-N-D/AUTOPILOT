// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Epic 0025 slice 2 (board web-mtywp7zq-55f3o9): the task board's
 * Columns/List toggle. The "Tasks" heading above it leads with the
 * `square-kanban` the Board tab draws, yet the toggle that lays the board out
 * as columns or as a list was bare words; the Settings menu slice left it so
 * because it wanted a vendored `list` and core sat about 200 bytes under its
 * raw line.
 *
 * The toggle leads with the shape of the view it offers: "Columns" with that
 * `square-kanban`, columns of cards, and "List" with a newly vendored `list`.
 * Each icon is decorative, so the button's name stays its words. A click
 * repaints the label in place, and the locale sweep keeps a leading icon, so
 * the icon survives a switch, a Hebrew page and every later tick.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axe from 'axe-core';
import { STRINGS } from '@autopilot/tokens';
import { renderShell, clientJs } from '../../src/web/shell.js';
import { layoutCss } from '../../src/web/layout-css.js';
import { ICON_SHAPES } from '../../src/web/icons.js';

const PROJECT = {
  id: 'p1',
  slug: 'alpha',
  name: 'Alpha',
  status: 'flying',
  createdAt: 1,
  primaryLanguage: 'typescript',
  fileCount: 12,
  totalBytes: 4096,
  languages: [{ language: 'typescript', files: 12, bytes: 4096 }],
  topDirs: [{ dir: 'src', files: 3 }],
  hotFiles: ['src/a.ts'],
  gate: 'js · vitest run',
  backedUp: true,
  firings: 6,
  shipped: 1,
  cost: 9,
  tokensIn: 1000,
  tokensOut: 500,
  shipRate: 0.16,
  openFindings: 0,
  gauge: { critical: 0, high: 0, medium: 0, low: 0 },
  lastActivityAt: 1,
  flightLog: [],
  activity: [],
  tasks: [{ id: 't1', title: 'ship it', status: 'open' }],
  anomalies: [],
  soulReviewed: true,
  soulProposed: null,
};

const STATE = {
  generatedAt: 1,
  totals: {
    projects: 1,
    flying: 1,
    needsYou: 0,
    firings: 6,
    shipped: 1,
    openFindings: 0,
    cost: 9,
  },
  projects: [PROJECT],
  empty: false,
};

// Each test evals the client bundle afresh and re-registers its top-level
// click delegates; document.open()/close() resets the DOM but not those
// listeners, so without this an earlier test's toggle delegate would answer a
// later click too and flip the view back (keeper-execute-button-icons.test.ts
// carries the same guard).
let restoreListeners: () => void = () => {};

function trackDocumentListeners(): void {
  const added: Array<
    [string, EventListenerOrEventListenerObject, boolean | AddEventListenerOptions | undefined]
  > = [];
  const original = document.addEventListener.bind(document);
  document.addEventListener = ((
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ) => {
    added.push([type, listener, options]);
    return original(type, listener, options);
  }) as typeof document.addEventListener;
  restoreListeners = () => {
    for (const [type, listener, options] of added) {
      document.removeEventListener(type, listener, options);
    }
    document.addEventListener = original;
  };
}

async function boot(state: unknown = STATE): Promise<void> {
  document.open();
  document.write(renderShell('p1'));
  document.close();
  localStorage.setItem('ap-tour-seen', '1');
  globalThis.fetch = vi.fn(
    async () => ({ ok: true, json: async () => state }) as unknown as Response,
  );
  new Function(clientJs())();
  await vi.advanceTimersByTimeAsync(1);
}

function toggle(): HTMLButtonElement {
  const b = document.querySelector('[data-board-view-toggle]') as HTMLButtonElement;
  expect(b).not.toBeNull();
  return b;
}

/** The toggle leads with `name`, decorative, and reads `key`'s words alone. */
function expectIconed(name: string, key: 'boardViewColumns' | 'boardViewList', lang = 'en') {
  const b = toggle();
  expect(b.getAttribute('data-i18n')).toBe(key);
  const icon = b.firstElementChild;
  expect(icon?.getAttribute('class')).toBe('icon icon-' + name);
  expect(icon?.getAttribute('aria-hidden')).toBe('true');
  expect([...icon!.children].map((c) => c.tagName.toLowerCase())).toEqual(
    ICON_SHAPES[name]!.map(([tag]) => tag),
  );
  expect(b.querySelectorAll('svg')).toHaveLength(1);
  expect(b.textContent).toBe(STRINGS[lang as 'en' | 'he'][key]);
  expect(b.hasAttribute('aria-label')).toBe(false);
}

describe('the board’s Columns/List toggle leads with a vendored icon (epic 0025)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    trackDocumentListeners();
  });
  afterEach(() => {
    restoreListeners();
    vi.useRealTimers();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('vendors Lucide’s list, three dots beside three lines', () => {
    expect(ICON_SHAPES['list']).toEqual([
      ['path', { d: 'M3 5h.01' }],
      ['path', { d: 'M3 12h.01' }],
      ['path', { d: 'M3 19h.01' }],
      ['path', { d: 'M8 5h13' }],
      ['path', { d: 'M8 12h13' }],
      ['path', { d: 'M8 19h13' }],
    ]);
  });

  it('a list board offers Columns, led by the square-kanban the heading draws', async () => {
    await boot();
    expect(
      document.querySelector('.detail-h[data-i18n="tasks"] > svg')?.getAttribute('class'),
    ).toBe('icon icon-square-kanban');
    expectIconed('square-kanban', 'boardViewColumns');
  });

  it('a click swaps to List, led by list, and back', async () => {
    await boot();

    toggle().click();
    expectIconed('list', 'boardViewList');

    toggle().click();
    expectIconed('square-kanban', 'boardViewColumns');
  });

  it('carries no aria-pressed: the label already names the view it offers, not the one showing, so a stale "List, pressed" while columns are on screen never reaches a screen reader (board ap-muvciftc-0)', async () => {
    await boot();
    expect(toggle().hasAttribute('aria-pressed')).toBe(false);

    toggle().click();
    expect(toggle().hasAttribute('aria-pressed')).toBe(false);

    toggle().click();
    expect(toggle().hasAttribute('aria-pressed')).toBe(false);
  });

  it('an "auto" board relabels the toggle when the window crosses the columns breakpoint, not only on the next data tick (board ap-muvciftc-0)', async () => {
    // Two flow groups (queued + in flight) keep "auto" as "auto", so the CSS
    // alone decides columns or list at 64rem and the label must follow it.
    const flowing = {
      ...STATE,
      projects: [
        {
          ...PROJECT,
          tasks: [
            { id: 't1', title: 'ship it', status: 'queued' },
            { id: 't2', title: 'in the air', status: 'in_progress' },
          ],
        },
      ],
    };
    let wide = true;
    const listeners = new Map<string, Array<() => void>>();
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      get matches() {
        return query === '(min-width: 64rem)' ? wide : false;
      },
      media: query,
      addEventListener: (_type: string, fn: () => void) => {
        listeners.set(query, [...(listeners.get(query) ?? []), fn]);
      },
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia;
    try {
      await boot(flowing);
      const card = document.querySelector('[data-board-view]') as HTMLElement;
      expect(card.getAttribute('data-board-view')).toBe('auto');
      expectIconed('list', 'boardViewList');

      wide = false;
      for (const fn of listeners.get('(min-width: 64rem)') ?? []) fn();
      expectIconed('square-kanban', 'boardViewColumns');

      wide = true;
      for (const fn of listeners.get('(min-width: 64rem)') ?? []) fn();
      expectIconed('list', 'boardViewList');
    } finally {
      window.matchMedia = original;
    }
  });

  it('a click on the icon itself still toggles the view', async () => {
    await boot();
    toggle().firstElementChild!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expectIconed('list', 'boardViewList');
  });

  it('a remembered columns view leads with list from the first paint', async () => {
    localStorage.setItem('ap-board-view', 'columns');
    await boot();
    expectIconed('list', 'boardViewList');
  });

  it('keeps the icon beside Hebrew words, through a click and tick after tick', async () => {
    await boot();
    (document.querySelector('[data-lang-btn="he"]') as HTMLButtonElement).click();
    expectIconed('square-kanban', 'boardViewColumns', 'he');

    toggle().click();
    expectIconed('list', 'boardViewList', 'he');

    await vi.advanceTimersByTimeAsync(6000);
    expectIconed('list', 'boardViewList', 'he');
  });

  it('spaces the icon from its words', () => {
    expect(layoutCss()).toContain('.board-view-toggle > .icon { margin-inline-end: 0.35em; }');
  });

  it('leaves the toggle axe-clean (WCAG A/AA)', async () => {
    await boot();
    expectIconed('square-kanban', 'boardViewColumns');

    vi.useRealTimers();
    const results = await axe.run(toggle(), {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(results.violations).toEqual([]);
  });
});
