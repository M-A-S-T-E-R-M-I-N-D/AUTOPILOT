// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Epic 0025 slice 2 (board web-mtywp7zq-55f3o9): the CONNECT popover's GitHub
 * group. The Claude half above it leads Log in, Test connection and Save &
 * verify with icons, and the version menu beside it leads its "Check now" with
 * `refresh-cw`, but the GitHub group's "Check for updates" was bare words.
 *
 * It does what "Check now" does: pull the newest release from GitHub and
 * compare it with the version this dashboard runs (its own tip says so). So it
 * leads with the same `refresh-cw` and takes the same `version-check` class
 * beside its `connect-test` one, which the version menu's spacing rule already
 * covers. Nothing is newly vendored and no rule is added. The icon is
 * decorative, so the button's name stays its words, and it is server-printed
 * markup the locale sweep keeps a leading icon in, so a Hebrew switch rewrites
 * only the words. A click only writes the update line beside it, so the icon
 * survives a check. Executes the ACTUAL client bundle (`clientJs()`) in jsdom,
 * the convention `connect-claude-action-icons.test.ts` uses.
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

const STATE = {
  generatedAt: 1,
  totals: { projects: 0, flying: 0, needsYou: 0, firings: 0, shipped: 0, openFindings: 0, cost: 0 },
  projects: [],
  empty: true,
};

const CURRENT = { chip: { text: 'v0.58.0 — up to date', status: 'up-to-date' } };

/** Boots the shell; the update read answers CURRENT, and a forced check
 *  (the button's POST) stays in flight while `hold.check` is true. */
async function boot(hold = { check: false }): Promise<void> {
  document.open();
  document.write(renderShell(''));
  document.close();
  globalThis.fetch = vi.fn(async (url: unknown, init?: RequestInit) => {
    const href = String(url);
    if (href.includes('/api/connection/gh-lts')) {
      if (init?.method === 'POST' && hold.check) return new Promise<Response>(() => {});
      return { ok: true, json: async () => CURRENT } as unknown as Response;
    }
    return { ok: true, json: async () => STATE } as unknown as Response;
  }) as unknown as typeof fetch;
  new Function(clientJs())();
  await vi.advanceTimersByTimeAsync(1);
}

const checkBtn = (): HTMLButtonElement =>
  document.getElementById('gh-lts-check') as HTMLButtonElement;
const ltsLine = (): HTMLElement => document.getElementById('gh-lts') as HTMLElement;

/** The button leads with the decorative `refresh-cw`, drawn shape for shape
 *  from the vendored data, and is named by its words. */
function expectIconed(lang: 'en' | 'he'): void {
  const b = checkBtn();
  const first = b.firstElementChild;
  expect(first).not.toBeNull();
  expect(first!.tagName.toLowerCase()).toBe('svg');
  expect(first!.getAttribute('class')).toBe('icon icon-refresh-cw');
  expect(first!.getAttribute('aria-hidden')).toBe('true');
  expect(first!.getAttribute('focusable')).toBe('false');
  expect([...first!.children].map((c) => c.tagName.toLowerCase())).toEqual(
    ICON_SHAPES['refresh-cw']!.map(([tag]) => tag),
  );
  expect(b.querySelectorAll('svg')).toHaveLength(1);
  expect(b.textContent).toBe(STRINGS[lang].checkForUpdates);
  expect(b.hasAttribute('aria-label')).toBe(false);
}

function switchTo(lang: 'en' | 'he'): void {
  (document.querySelector(`[data-lang-btn="${lang}"]`) as HTMLButtonElement).click();
}

describe('the CONNECT popover’s Check for updates leads with refresh-cw (epic 0025)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('leads with the version menu’s refresh-cw, words and tag unchanged', async () => {
    await boot();

    expectIconed('en');
    expect(checkBtn().getAttribute('data-i18n')).toBe('checkForUpdates');
    // The same shape, point for point, as the version menu's Check now.
    const versionCheck = document.getElementById('version-check') as HTMLButtonElement;
    expect(checkBtn().firstElementChild!.outerHTML).toBe(versionCheck.firstElementChild!.outerHTML);
  });

  it('a Hebrew switch and a fleet tick rewrite the words beside the same icon, and back', async () => {
    await boot();

    switchTo('he');
    expectIconed('he');

    await vi.advanceTimersByTimeAsync(6000);
    expectIconed('he');

    switchTo('en');
    expectIconed('en');
  });

  it('a check in flight, and the answer, write the update line and leave the icon', async () => {
    const hold = { check: true };
    await boot(hold);

    checkBtn().firstElementChild!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(1);
    expect(ltsLine().textContent).toBe(STRINGS.en.ltsChecking);
    expectIconed('en');

    hold.check = false;
    checkBtn().click();
    await vi.advanceTimersByTimeAsync(1);
    expect(ltsLine().textContent).toBe(CURRENT.chip.text);
    expectIconed('en');
  });

  it('shares the version menu’s check class, whose rule spaces the icon from its words', async () => {
    await boot();

    expect(checkBtn().classList.contains('connect-test')).toBe(true);
    expect(checkBtn().classList.contains('version-check')).toBe(true);
    expect(layoutCss()).toContain(
      '.version-run > .icon, .version-check > .icon { margin-inline-end: 0.35em; }',
    );
  });

  it('leaves the open popover’s updates group axe-clean (WCAG A/AA)', async () => {
    await boot();
    (document.getElementById('connect') as HTMLDetailsElement).open = true;

    vi.useRealTimers();
    const results = await axe.run(checkBtn().parentElement as HTMLElement, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(results.violations).toEqual([]);
  });
});
