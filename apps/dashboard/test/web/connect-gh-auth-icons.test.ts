// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Epic 0025 slice 2 (board web-mtywp7zq-55f3o9): the CONNECT popover's GitHub
 * sign-in. The Claude half leads Log in, Test connection and Save & verify
 * with icons, and the GitHub group's Check for updates leads with
 * `refresh-cw`, but the three verbs that manage the gh login were bare words.
 *
 * "Log in with GitHub" leads with `square-terminal`, the shape "Log in with
 * Claude" draws above it, since both open a terminal running that CLI's login
 * (its own tip says so). "Switch account" leads with `users`, the accounts gh
 * already holds, one of which the terminal asks you to pick. "Log out" leads
 * with `lock`, since it shuts the dashboard's GitHub-backed actions until
 * someone logs in again. Nothing is newly vendored: core sits at its raw line.
 * Each icon is decorative, so a button's name stays its words, and each is
 * server-printed markup the locale sweep keeps a leading icon in, so a Hebrew
 * switch rewrites only the words. A click only writes the status line, and a
 * login only toggles which buttons are `hidden`, so the icons survive both.
 * Executes the ACTUAL client bundle (`clientJs()`) in jsdom, the convention
 * `connect-claude-action-icons.test.ts` uses.
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

/** Boots the shell with gh installed; `gh.authenticated` decides which verbs
 *  show. A login, switch or logout POST stays in flight, so a run can be read. */
async function boot(gh = { authenticated: false }): Promise<void> {
  document.open();
  document.write(renderShell(''));
  document.close();
  globalThis.fetch = vi.fn(async (url: unknown, init?: RequestInit) => {
    const href = String(url);
    if (href.includes('/api/connection/gh-lts')) {
      return { ok: true, json: async () => null } as unknown as Response;
    }
    if (href.includes('/api/connection/gh/') && init?.method === 'POST') {
      return new Promise<Response>(() => {});
    }
    if (href.includes('/api/connection/gh')) {
      const s = { present: true, authenticated: gh.authenticated, login: 'octocat' };
      return { ok: true, json: async () => s } as unknown as Response;
    }
    return { ok: true, json: async () => STATE } as unknown as Response;
  }) as unknown as typeof fetch;
  new Function(clientJs())();
  await vi.advanceTimersByTimeAsync(1);
}

const btn = (id: string): HTMLButtonElement => document.getElementById(id) as HTMLButtonElement;
const ghStatus = (): HTMLElement => document.getElementById('gh-status') as HTMLElement;

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
  expectIconed(btn('gh-login'), 'square-terminal', STRINGS[lang].ghLogin);
  expectIconed(btn('gh-switch'), 'users', STRINGS[lang].ghSwitch);
  expectIconed(btn('gh-logout'), 'lock', STRINGS[lang].ghLogout);
}

function switchTo(lang: 'en' | 'he'): void {
  (document.querySelector(`[data-lang-btn="${lang}"]`) as HTMLButtonElement).click();
}

describe('the CONNECT popover’s GitHub sign-in leads with vendored icons (epic 0025)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('leads Log in, Switch account and Log out with their icons, words and tags unchanged', async () => {
    await boot();

    expectAll('en');
    expect(btn('gh-login').getAttribute('data-i18n')).toBe('ghLogin');
    expect(btn('gh-switch').getAttribute('data-i18n')).toBe('ghSwitch');
    expect(btn('gh-logout').getAttribute('data-i18n')).toBe('ghLogout');
    // Log in draws the same shape, point for point, as Log in with Claude.
    expect(btn('gh-login').firstElementChild!.outerHTML).toBe(
      btn('connect-login').firstElementChild!.outerHTML,
    );
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

  it('logged out shows Log in alone, logged in shows Switch and Log out, each iconed', async () => {
    await boot();
    expect(document.getElementById('gh-auth')!.hidden).toBe(false);
    expect([btn('gh-login').hidden, btn('gh-switch').hidden, btn('gh-logout').hidden]).toEqual([
      false,
      true,
      true,
    ]);
    expectAll('en');

    await boot({ authenticated: true });
    expect([btn('gh-login').hidden, btn('gh-switch').hidden, btn('gh-logout').hidden]).toEqual([
      true,
      false,
      false,
    ]);
    expectAll('en');
  });

  it('a login, switch or logout in flight writes the status line and leaves the icons', async () => {
    await boot();
    btn('gh-login').firstElementChild!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(1);
    expect(ghStatus().textContent).toBe(STRINGS.en.ghAuthLaunching);
    expectAll('en');

    await boot({ authenticated: true });
    btn('gh-switch').click();
    await vi.advanceTimersByTimeAsync(1);
    expect(ghStatus().textContent).toBe(STRINGS.en.ghAuthLaunching);
    btn('gh-logout').click();
    await vi.advanceTimersByTimeAsync(1);
    expect(ghStatus().textContent).toBe(STRINGS.en.ghAuthLaunching);
    expectAll('en');
  });

  it('spaces each icon from its words', () => {
    expect(layoutCss()).toContain('.gh-auth > button > .icon { margin-inline-end: 0.35em; }');
  });

  it('leaves the open popover’s GitHub sign-in axe-clean, logged out and in (WCAG A/AA)', async () => {
    for (const authenticated of [false, true]) {
      vi.useFakeTimers();
      await boot({ authenticated });
      (document.getElementById('connect') as HTMLDetailsElement).open = true;

      vi.useRealTimers();
      const results = await axe.run(document.getElementById('gh-auth') as HTMLElement, {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
        rules: { 'color-contrast': { enabled: false } },
      });
      expect(results.violations).toEqual([]);
    }
  });
});
