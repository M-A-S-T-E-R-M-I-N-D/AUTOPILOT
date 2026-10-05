// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Epic 0025 slice 2 (board web-mtywp7zq-55f3o9): the CONNECT popover's Claude
 * actions. The popover's report form leads Compose with `sparkles` and its
 * submit with `flag`, and the version menu beside it leads Run the latest and
 * Check now with `rocket` and `refresh-cw`, but the three buttons that sign
 * Claude in were bare words.
 *
 * "Log in with Claude" leads with `square-terminal`, since it opens a terminal
 * running Claude login (its own tip says so, and the activity feed draws the
 * same shape for a command). "Test connection" leads with `activity`, the
 * pulse the CI status and process-health headings draw, since it makes one
 * real call to see the line is alive. "Save & verify" leads with
 * `shield-check`, since it stores the credential and verifies it. Nothing is
 * newly vendored. Each icon is decorative, so a button's name stays its
 * words, and each is server-printed markup the locale sweep keeps a leading
 * icon in, so a Hebrew switch rewrites only the words. A click only writes the
 * status line, so the icons survive a run. Executes the ACTUAL client bundle
 * (`clientJs()`) in jsdom, the convention `connect-report-form-icons.test.ts`
 * uses.
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

async function boot(): Promise<void> {
  document.open();
  document.write(renderShell(''));
  document.close();
  globalThis.fetch = vi.fn(async (url: unknown) => {
    // A connection test and a login stay in flight, so a run can be read.
    const href = String(url);
    if (href.includes('/api/connection/test') || href.includes('/api/connection/login')) {
      return new Promise<Response>(() => {});
    }
    return { ok: true, json: async () => STATE } as unknown as Response;
  }) as unknown as typeof fetch;
  new Function(clientJs())();
  await vi.advanceTimersByTimeAsync(1);
}

const loginBtn = (): HTMLButtonElement =>
  document.getElementById('connect-login') as HTMLButtonElement;
const testBtn = (): HTMLButtonElement =>
  document.getElementById('connect-test') as HTMLButtonElement;
const saveBtn = (): HTMLButtonElement =>
  document.querySelector('#connect-form button[type="submit"]') as HTMLButtonElement;

/** The button leads with the named decorative icon, drawn shape for shape
 *  from the vendored data, and is named by its words. */
function expectIconed(b: HTMLButtonElement, icon: string, words: string): void {
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
  expect(b.textContent, icon).toBe(words);
  expect(b.hasAttribute('aria-label'), icon).toBe(false);
}

function expectAll(lang: 'en' | 'he'): void {
  expectIconed(loginBtn(), 'square-terminal', STRINGS[lang].loginClaude);
  expectIconed(testBtn(), 'activity', STRINGS[lang].testConnection);
  expectIconed(saveBtn(), 'shield-check', STRINGS[lang].saveVerify);
}

function switchTo(lang: 'en' | 'he'): void {
  (document.querySelector(`[data-lang-btn="${lang}"]`) as HTMLButtonElement).click();
}

describe('the CONNECT popover’s Claude actions lead with vendored icons (epic 0025)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('leads Log in, Test connection and Save & verify with their icons, words unchanged', async () => {
    await boot();

    expectAll('en');
    expect(loginBtn().getAttribute('data-i18n')).toBe('loginClaude');
    expect(testBtn().getAttribute('data-i18n')).toBe('testConnection');
    expect(saveBtn().getAttribute('data-i18n')).toBe('saveVerify');
  });

  it('a Hebrew switch and a fleet tick rewrite the words beside the same icons, and back', async () => {
    await boot();

    switchTo('he');
    expectAll('he');

    await vi.advanceTimersByTimeAsync(6000);
    expectAll('he');

    switchTo('en');
    expectAll('en');
  });

  it('a test or a login in flight writes the status line and leaves the icons', async () => {
    await boot();

    testBtn().firstElementChild!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(1);
    expect(document.getElementById('connect-status')!.textContent).toBe(STRINGS.en.connectTesting);

    loginBtn().click();
    await vi.advanceTimersByTimeAsync(1);
    expect(document.getElementById('connect-status')!.textContent).toBe(
      STRINGS.en.connectLaunchingLogin,
    );

    expectAll('en');
  });

  it('spaces each icon from its words', () => {
    expect(layoutCss()).toContain(
      '#connect-login > .icon, #connect-test > .icon, #connect-form > button > .icon { margin-inline-end: 0.35em; }',
    );
  });

  it('leaves the open popover’s Claude section axe-clean (WCAG A/AA)', async () => {
    await boot();
    (document.getElementById('connect') as HTMLDetailsElement).open = true;

    vi.useRealTimers();
    for (const region of [
      loginBtn().parentElement as HTMLElement,
      document.getElementById('connect-form') as HTMLElement,
    ]) {
      const results = await axe.run(region, {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
        rules: { 'color-contrast': { enabled: false } },
      });
      expect(results.violations).toEqual([]);
    }
  });
});
