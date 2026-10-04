// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Epic 0025 slice 2 (board web-mtywp7zq-55f3o9): the Firing Replay's Exit.
 * The toggle that opens playback leads with `play`, and the bar it opens
 * steps with a `chevron-left` Prev and a `chevron-right` Next, but the
 * "Exit replay" button at the bar's end was bare words.
 *
 * It leads with the `x` the What's new Close, the Docs editor's Cancel and the
 * flight console's Cancel draw now, since it puts the replay away and brings
 * the full trace list back; nothing is newly vendored. `x` is symmetric, so it
 * takes no `dir="rtl"` mirror the chevrons beside it need. The icon is
 * decorative, so the button's name stays its words. The bar is rebuilt on
 * every step and the locale sweep goes through `setSweptText()`, so neither a
 * step nor a switch drops the icon. Drives the REAL client bundle in jsdom
 * against a mocked /api/state, the `firing-replay-i18n.test.ts` harness.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axe from 'axe-core';
import { STRINGS } from '@autopilot/tokens';
import { renderShell, clientJs } from '../../src/web/shell.js';
import { layoutCss } from '../../src/web/layout-css.js';
import { ICON_SHAPES } from '../../src/web/icons.js';

// Every boot re-registers the client's document/window listeners; strip them
// after each test so a stale bundle's delegate never answers a later click.
type Tracked = [EventTarget, string, EventListenerOrEventListenerObject, unknown];
const trackedListeners: Tracked[] = [];
for (const target of [document, window] as EventTarget[]) {
  const native = target.addEventListener.bind(target);
  target.addEventListener = ((
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: unknown,
  ) => {
    trackedListeners.push([target, type, listener, options]);
    return native(type, listener, options as AddEventListenerOptions | undefined);
  }) as typeof target.addEventListener;
}
afterEach(() => {
  for (const [target, type, listener, options] of trackedListeners.splice(0)) {
    target.removeEventListener(type, listener, options as EventListenerOptions | undefined);
  }
});

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
  tasks: [],
  activity: [
    { tool: 'Edit', target: 'src/a.ts', kind: 'file', phase: 'do', at: 3, firingId: 'f1' },
    { tool: 'Read', target: 'src/b.ts', kind: 'file', phase: 'orient', at: 2, firingId: 'f1' },
    { tool: 'Grep', target: 'TODO', kind: 'search', phase: 'orient', at: 1, firingId: 'f1' },
  ],
};

const STATE = {
  generatedAt: 1,
  totals: { projects: 1, flying: 1, needsYou: 0, firings: 0, shipped: 0, openFindings: 0, cost: 0 },
  projects: [PROJECT],
  empty: false,
};

function boot(): void {
  document.open();
  document.write(renderShell('p1'));
  document.close();
  globalThis.fetch = vi.fn(
    async () => ({ ok: true, json: async () => STATE }) as unknown as Response,
  ) as unknown as typeof fetch;
  new Function(clientJs())();
}

function q(selector: string): HTMLElement {
  const node = document.querySelector<HTMLElement>(selector);
  expect(node, selector).not.toBeNull();
  return node as HTMLElement;
}

function click(selector: string): void {
  q(selector).dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

async function enterReplay(): Promise<void> {
  boot();
  await vi.advanceTimersByTimeAsync(1);
  click('[data-firing-toggle="f1"]');
  await vi.advanceTimersByTimeAsync(1);
  click('[data-replay-start="f1"]');
  await vi.advanceTimersByTimeAsync(1);
}

function clickLocale(locale: 'en' | 'he'): void {
  (document.querySelector(`[data-lang-btn="${locale}"]`) as HTMLButtonElement).click();
}

function exitButton(): HTMLButtonElement {
  return q('[data-replay-exit="f1"]') as HTMLButtonElement;
}

/** The button's first child is the decorative x stroke, drawn whole. */
function expectLeadingIcon(button: HTMLElement): void {
  const icon = button.firstElementChild;
  expect(icon?.tagName).toBe('svg');
  expect(icon?.classList.contains('icon')).toBe(true);
  expect(icon?.classList.contains('icon-x')).toBe(true);
  expect(icon?.getAttribute('aria-hidden')).toBe('true');
  expect(icon?.getAttribute('focusable')).toBe('false');
  expect(icon?.children).toHaveLength(ICON_SHAPES['x']!.length);
  expect(button.querySelectorAll('svg')).toHaveLength(1);
}

describe('the Firing Replay’s Exit leads with a vendored icon (epic 0025)', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('reuses the dismiss pair’s x — nothing newly vendored — and spaces it from the words', () => {
    expect(ICON_SHAPES['x']).toBeDefined();
    expect(layoutCss()).toContain('.replay-nav-exit > .icon { margin-inline-end: 0.35em; }');
  });

  it('Exit leads with x; its words and name stay "Exit replay"', async () => {
    await enterReplay();

    const button = exitButton();
    expectLeadingIcon(button);
    expect(button.textContent).toBe('Exit replay');
    expect(button.getAttribute('aria-label')).toBe('Exit replay');
    expect(button.getAttribute('data-i18n')).toBe('replayExit');
  });

  it('a step rebuilds the bar with the icon still leading', async () => {
    await enterReplay();

    click('[data-replay-next="f1"]');
    await vi.advanceTimersByTimeAsync(1);
    expect(q('.replay-nav-label').textContent).toBe('Step 2 of 3');
    expectLeadingIcon(exitButton());
    expect(exitButton().textContent).toBe('Exit replay');
  });

  it('a locale switch repaints the words beside the icon, not over it', async () => {
    await enterReplay();

    clickLocale('he');
    expectLeadingIcon(exitButton());
    expect(exitButton().textContent).toBe(STRINGS.he.replayExit);
    expect(exitButton().getAttribute('aria-label')).toBe(STRINGS.he.replayExit);

    clickLocale('en');
    expectLeadingIcon(exitButton());
    expect(exitButton().textContent).toBe('Exit replay');
  });

  it('a saved Hebrew locale paints the iconed Exit at build', async () => {
    localStorage.setItem('ap-locale', 'he');
    await enterReplay();

    expectLeadingIcon(exitButton());
    expect(exitButton().textContent).toBe(STRINGS.he.replayExit);
  });

  it('a click on the icon itself still leaves the replay', async () => {
    await enterReplay();

    exitButton().firstElementChild!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(1);
    expect(document.querySelector('.replay-nav')).toBeNull();
    expect(q('[data-replay-start="f1"]').textContent).toBe('Step through');
  });

  it('leaves the replay bar axe-clean (WCAG A/AA)', async () => {
    await enterReplay();
    // Real timers for axe's own scheduling; the bar is already painted.
    vi.useRealTimers();

    const results = await axe.run(document.querySelector('.firing-timeline') as Element, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(results.violations.map((v) => v.id)).toEqual([]);
  });
});
