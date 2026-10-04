// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Epic 0025 slice 2 (board web-mtywp7zq-55f3o9): the search bar's Search and
 * Ask buttons. The command palette's title leads with `search` and the Ask
 * button in the corner and its sheet's title lead with `message-circle`, but
 * the search bar's own Search and Ask, the pair a code question starts from,
 * were bare words.
 *
 * Search leads with the `search` the palette's title and the backlog heading
 * draw; Ask leads with the `message-circle` the Ask corner button and the Ask
 * sheet draw, since it asks the same model. Nothing is newly vendored, and
 * both are server-printed markup the locale sweep keeps a leading icon in.
 * Ask swaps "Ask" for "Asking…" and back mid-request; that swap used to
 * replace the button's whole `textContent`, so it now goes through
 * `setSweptText()` and the icon survives a run and a failed one. Each icon is
 * decorative, so a button's name stays its words. Executes the ACTUAL client
 * bundle (`clientJs()`) in jsdom, the convention `ask-flow-i18n.test.ts` uses.
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
  totals: { projects: 1, flying: 0, needsYou: 0, firings: 0, shipped: 0, openFindings: 0, cost: 0 },
  projects: [PROJECT],
  empty: false,
};

/** How the mocked `/api/ask/stream` answers: a rejection, or never (the
 *  request stays in flight). */
type AskMode = 'fail' | 'pending';

async function boot(mode: AskMode): Promise<void> {
  document.open();
  document.write(renderShell(''));
  document.close();
  globalThis.fetch = vi.fn(async (url: unknown) => {
    if (!String(url).includes('/api/ask/stream')) {
      return { ok: true, json: async () => STATE } as unknown as Response;
    }
    if (mode === 'fail') throw new Error('connection refused');
    return new Promise<Response>(() => {});
  }) as unknown as typeof fetch;
  new Function(clientJs())();
  await vi.advanceTimersByTimeAsync(1);
}

const searchGo = (): HTMLButtonElement => document.getElementById('search-go') as HTMLButtonElement;
const askGo = (): HTMLButtonElement => document.getElementById('ask-go') as HTMLButtonElement;

/** The button leads with the named decorative icon, drawn shape for shape
 *  from the vendored data, and is named by its words. */
function expectIconed(b: HTMLButtonElement, icon: string): void {
  const first = b.firstElementChild;
  expect(first, icon).not.toBeNull();
  expect(first!.tagName.toLowerCase(), icon).toBe('svg');
  expect(first!.getAttribute('class'), icon).toBe('icon icon-' + icon);
  expect(first!.getAttribute('aria-hidden'), icon).toBe('true');
  expect(first!.getAttribute('focusable'), icon).toBe('false');
  expect(
    [...first!.children].map((c) => c.tagName.toLowerCase()),
    icon,
  ).toEqual(ICON_SHAPES[icon]!.map(([tag]) => tag));
  expect(b.querySelectorAll('svg'), icon).toHaveLength(1);
  expect(b.hasAttribute('aria-label'), icon).toBe(false);
}

/** Fills the search bar and clicks Ask through its icon, the way a pointer
 *  landing on the drawn shape does. */
async function askThroughIcon(): Promise<void> {
  (document.getElementById('search-project') as HTMLSelectElement).value = 'p1';
  (document.getElementById('search-q') as HTMLInputElement).value = 'why?';
  askGo().firstElementChild!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await vi.advanceTimersByTimeAsync(10);
}

function switchTo(lang: 'en' | 'he'): void {
  (document.querySelector(`[data-lang-btn="${lang}"]`) as HTMLButtonElement).click();
}

describe('the search bar’s Search and Ask lead with stroke icons (epic 0025)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('leads Search with search and Ask with message-circle, their words unchanged', async () => {
    await boot('pending');

    expectIconed(searchGo(), 'search');
    expectIconed(askGo(), 'message-circle');
    expect(searchGo().textContent).toBe(STRINGS.en.search);
    expect(askGo().textContent).toBe(STRINGS.en.ask);
  });

  it('a locale switch rewrites both buttons’ words and keeps both icons', async () => {
    await boot('pending');

    switchTo('he');
    expect(searchGo().textContent).toBe(STRINGS.he.search);
    expect(askGo().textContent).toBe(STRINGS.he.ask);
    expectIconed(searchGo(), 'search');
    expectIconed(askGo(), 'message-circle');

    switchTo('en');
    expect(searchGo().textContent).toBe(STRINGS.en.search);
    expect(askGo().textContent).toBe(STRINGS.en.ask);
    expectIconed(searchGo(), 'search');
    expectIconed(askGo(), 'message-circle');
  });

  it('a click on the icon still asks, and Ask keeps its icon through the busy words', async () => {
    await boot('pending');

    await askThroughIcon();

    expect(askGo().disabled).toBe(true);
    expect(askGo().textContent).toBe(STRINGS.en.askAsking);
    expect(askGo().getAttribute('data-i18n')).toBe('askAsking');
    expectIconed(askGo(), 'message-circle');

    switchTo('he');
    expect(askGo().textContent).toBe(STRINGS.he.askAsking);
    expectIconed(askGo(), 'message-circle');
  });

  it('a failed ask restores the idle words beside the same icon', async () => {
    await boot('fail');

    await askThroughIcon();

    expect(askGo().disabled).toBe(false);
    expect(askGo().textContent).toBe(STRINGS.en.ask);
    expect(askGo().getAttribute('data-i18n')).toBe('ask');
    expectIconed(askGo(), 'message-circle');
  });

  it('spaces each icon from its words', () => {
    expect(layoutCss()).toContain(
      '#search-go > .icon, #ask-go > .icon { margin-inline-end: 0.35em; }',
    );
  });

  it('leaves the search form axe-clean (WCAG A/AA)', async () => {
    await boot('pending');
    const bar = document.getElementById('searchbar') as HTMLElement;
    bar.hidden = false;
    const form = document.getElementById('search-form') as HTMLElement;
    expect(form.closest('[hidden]')).toBeNull();

    vi.useRealTimers();
    const results = await axe.run(form, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(results.violations).toEqual([]);
  });
});
