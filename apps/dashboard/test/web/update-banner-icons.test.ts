// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Epic 0025 (board web-mtywp7zq-55f3o9): the over-the-air update banner. It
 * appears above the masthead only when a newer release is out, yet its
 * "Update now" and "Later" were bare words beside every iconed execute
 * button. "Update now" leads with the `rocket` the What's new message titles
 * with, the message this very update brings up next, and "Later" with the
 * Versions heading's `clock`, since it puts the offer off for the session;
 * neither is newly vendored. Each icon is decorative, so a button's name
 * stays its words. The words sit in an inner `[data-i18n]` span, so a locale
 * switch rewrites them beside the icon instead of leaving English behind.
 * Executes the ACTUAL client bundle (`clientJs()`) in jsdom, the convention
 * `version-menu.test.ts` uses for the same update check.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axe from 'axe-core';
import { STRINGS } from '@autopilot/tokens';
import { layoutCss } from '../../src/web/layout-css.js';
import { renderShell, clientJs } from '../../src/web/shell.js';

const CHECK = { current: '0.43.0', latest: '0.44.0', updateAvailable: true, checkedAt: 0 };

function res(status: number, body: unknown): Response {
  const r = {
    ok: status === 200,
    status,
    json: async () => body,
    clone() {
      return r;
    },
  };
  return r as unknown as Response;
}

/** Boots the shell with a newer release on offer; `execute` answers the
 *  update POST. */
async function boot(execute: () => Response = () => res(200, {})): Promise<HTMLElement> {
  document.open();
  document.write(renderShell());
  document.close();
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith('/api/update-check')) return res(200, CHECK);
    if (url === '/api/update/execute') return execute();
    return res(200, {});
  }) as unknown as typeof fetch;
  new Function(clientJs())();
  const banner = document.getElementById('update-banner') as HTMLElement;
  await vi.waitFor(() => {
    expect(banner.hidden).toBe(false);
  });
  return banner;
}

/** The button leads with the named decorative icon, its words in a tagged span. */
function expectIconed(b: Element | null, icon: string, key: 'updateNow' | 'updateLater'): void {
  expect(b).not.toBeNull();
  expect(b!.children).toHaveLength(2);
  const first = b!.firstElementChild!;
  expect(first.getAttribute('class')).toBe('icon icon-' + icon);
  expect(first.getAttribute('aria-hidden')).toBe('true');
  expect(b!.lastElementChild!.matches(`span[data-i18n="${key}"]`)).toBe(true);
  expect(b!.hasAttribute('aria-label')).toBe(false);
}

describe('the update banner’s buttons lead with stroke icons (epic 0025)', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('ap-tour-seen', '1');
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('leads Update now with rocket and Later with clock, their words unchanged', async () => {
    const banner = await boot();

    const go = banner.querySelector('.update-banner-go');
    const later = banner.querySelector('.update-banner-later');
    expectIconed(go, 'rocket', 'updateNow');
    expectIconed(later, 'clock', 'updateLater');
    expect(go!.textContent).toBe(STRINGS.en.updateNow);
    expect(later!.textContent).toBe(STRINGS.en.updateLater);
  });

  it('a locale switch rewrites the words and keeps both icons', async () => {
    const banner = await boot();

    (document.querySelector('[data-lang-btn="he"]') as HTMLButtonElement).click();

    const go = banner.querySelector('.update-banner-go');
    const later = banner.querySelector('.update-banner-later');
    expectIconed(go, 'rocket', 'updateNow');
    expectIconed(later, 'clock', 'updateLater');
    expect(go!.textContent).toBe(STRINGS.he.updateNow);
    expect(later!.textContent).toBe(STRINGS.he.updateLater);
  });

  it('a refused update offers Update now again, led by the same rocket', async () => {
    const banner = await boot(() => res(409, { error: 'update in progress' }));

    (banner.querySelector('.update-banner-go') as HTMLButtonElement).click();

    await vi.waitFor(() => {
      expect(banner.textContent).toContain(STRINGS.en.updateRefused + 'update in progress');
    });
    const retry = banner.querySelector('.update-banner-go');
    expectIconed(retry, 'rocket', 'updateNow');
    expect(retry!.textContent).toBe(STRINGS.en.updateNow);
  });

  it('Later still dismisses the banner for the offered version', async () => {
    const banner = await boot();

    (banner.querySelector('.update-banner-later') as HTMLButtonElement).click();

    expect(banner.hidden).toBe(true);
    expect(sessionStorage.getItem('ap-update-dismissed')).toBe(CHECK.latest);
  });

  it('spaces each icon from its words', () => {
    expect(layoutCss()).toContain(
      '.update-banner-go > .icon, .update-banner-later > .icon { margin-inline-end: 0.35em; }',
    );
  });

  it('leaves the shown banner axe-clean (WCAG A/AA)', async () => {
    const banner = await boot();

    const results = await axe.run(banner, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(results.violations).toEqual([]);
  });
});
