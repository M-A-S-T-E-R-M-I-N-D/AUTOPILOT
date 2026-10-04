// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Epic 0025 (board web-mtywp7zq-55f3o9): the masthead's version menu. Its
 * "Run the latest" / "Update to vX" button and its "Check now" were bare
 * words beside the update banner's iconed Update now. The run button leads
 * with that banner's `rocket`, since both start the same update, and Check
 * now with the round panel's `refresh-cw`, since it forces a fresh check;
 * neither is newly vendored. Each icon is decorative, so a button's name
 * stays its words.
 *
 * The run button also kept `data-i18n="versionRunLatest"` while it read
 * "Update to vX", so the next `translateDom()` sweep (every fleet tick, and
 * every locale switch) painted "Run the latest" over the offer. An offered
 * update now tags the button with the `versionRunUpdate` template and its
 * `{to}` slot, and the sweep keeps both the words and the icon.
 * Executes the ACTUAL client bundle (`clientJs()`) in jsdom, the convention
 * `version-menu.test.ts` uses for the same menu.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axe from 'axe-core';
import { STRINGS } from '@autopilot/tokens';
import { layoutCss } from '../../src/web/layout-css.js';
import { renderShell, clientJs } from '../../src/web/shell.js';

interface Check {
  current: string;
  latest: string;
  updateAvailable: boolean;
  checkedAt: number;
}

const CURRENT: Check = {
  current: '0.43.0',
  latest: '0.43.0',
  updateAvailable: false,
  checkedAt: 0,
};
const NEWER: Check = { current: '0.43.0', latest: '0.44.0', updateAvailable: true, checkedAt: 0 };

/** Boots the shell; each update check answers whatever `answer.check` holds
 *  at that moment, so a test can flip it before "Check now". */
async function boot(first: Check): Promise<{ answer: { check: Check } }> {
  const answer = { check: first };
  document.open();
  document.write(renderShell());
  document.close();
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith('/api/update-check')) {
      return { ok: true, json: async () => answer.check } as unknown as Response;
    }
    return { ok: true, json: async () => ({}) } as unknown as Response;
  }) as unknown as typeof fetch;
  new Function(clientJs())();
  await vi.waitFor(() => {
    expect(document.getElementById('version-menu')?.getAttribute('data-update')).toBe(
      first.updateAvailable ? 'available' : 'current',
    );
  });
  return { answer };
}

function btn(id: 'version-run' | 'version-check'): HTMLButtonElement {
  return document.getElementById(id) as HTMLButtonElement;
}

/** The button leads with the named decorative icon and is named by its words. */
function expectIconed(b: HTMLButtonElement, icon: string): void {
  const first = b.firstElementChild;
  expect(first).not.toBeNull();
  expect(first!.getAttribute('class')).toBe('icon icon-' + icon);
  expect(first!.getAttribute('aria-hidden')).toBe('true');
  expect(b.querySelectorAll('svg')).toHaveLength(1);
  expect(b.hasAttribute('aria-label')).toBe(false);
}

function switchTo(lang: 'en' | 'he'): void {
  (document.querySelector(`[data-lang-btn="${lang}"]`) as HTMLButtonElement).click();
}

const updateTo = (lang: 'en' | 'he', to: string): string =>
  STRINGS[lang].versionRunUpdate.replace('{to}', to);

describe('the version menu’s buttons lead with stroke icons (epic 0025)', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('ap-tour-seen', '1');
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('leads Run the latest with rocket and Check now with refresh-cw, their words unchanged', async () => {
    await boot(CURRENT);

    expectIconed(btn('version-run'), 'rocket');
    expectIconed(btn('version-check'), 'refresh-cw');
    expect(btn('version-run').textContent).toBe(STRINGS.en.versionRunLatest);
    expect(btn('version-check').textContent).toBe(STRINGS.en.versionCheckNow);
  });

  it('a locale switch rewrites both buttons’ words and keeps both icons', async () => {
    await boot(CURRENT);

    switchTo('he');

    expectIconed(btn('version-run'), 'rocket');
    expectIconed(btn('version-check'), 'refresh-cw');
    expect(btn('version-run').textContent).toBe(STRINGS.he.versionRunLatest);
    expect(btn('version-check').textContent).toBe(STRINGS.he.versionCheckNow);
  });

  it('an offered update keeps "Update to vX" and the rocket through every sweep', async () => {
    await boot(NEWER);
    expect(btn('version-run').textContent).toBe(updateTo('en', '0.44.0'));

    switchTo('he');
    expect(btn('version-run').textContent).toBe(updateTo('he', '0.44.0'));
    expectIconed(btn('version-run'), 'rocket');

    switchTo('en');
    expect(btn('version-run').textContent).toBe(updateTo('en', '0.44.0'));
    expectIconed(btn('version-run'), 'rocket');
  });

  it('a later check that finds the checkout current goes back to Run the latest', async () => {
    const { answer } = await boot(NEWER);

    answer.check = { ...CURRENT, current: '0.44.0', latest: '0.44.0' };
    btn('version-check').click();
    await vi.waitFor(() => {
      expect(document.getElementById('version-menu')?.getAttribute('data-update')).toBe('current');
    });

    expect(btn('version-run').textContent).toBe(STRINGS.en.versionRunLatest);
    expectIconed(btn('version-run'), 'rocket');
    switchTo('he');
    expect(btn('version-run').textContent).toBe(STRINGS.he.versionRunLatest);
    expectIconed(btn('version-run'), 'rocket');
  });

  it('spaces each icon from its words', () => {
    expect(layoutCss()).toContain(
      '.version-run > .icon, .version-check > .icon { margin-inline-end: 0.35em; }',
    );
  });

  it('leaves the open menu axe-clean (WCAG A/AA)', async () => {
    await boot(NEWER);
    const menu = document.getElementById('version-menu') as HTMLDetailsElement;
    menu.open = true;

    const results = await axe.run(menu, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(results.violations).toEqual([]);
  });
});
