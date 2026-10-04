// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Epic 0025 (board web-mtywp7zq-55f3o9): the masthead's Settings menu. Its
 * summary draws `settings` and the version menu beside it leads Run the
 * latest and Check now with icons, yet the menu's two buttons, "Reset to
 * defaults" and the "What's new" row the `/whats-new.js` chunk appends, were
 * bare words. Reset leads with the `rotate-ccw` Start over draws, since both
 * put something back as it began, and What's new with the `sparkles` its
 * message heads "What you can do now" with; neither is newly vendored. Each
 * icon is decorative, so a button's name stays its words.
 *
 * What's new rewrote its whole `textContent` on every `lang` change, which
 * would delete a leading icon; it rewrites only its words now.
 * Executes the ACTUAL client bundle (`clientJs()`) and the ACTUAL chunk
 * (`whatsNewClientJs()`) in jsdom, the convention `version-menu-icons.test.ts`
 * and `whats-new-client.test.ts` use.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axe from 'axe-core';
import { STRINGS } from '@autopilot/tokens';
import { layoutCss } from '../../src/web/layout-css.js';
import { renderShell, clientJs } from '../../src/web/shell.js';
import {
  whatsNewClientJs,
  whatsNewCss,
  WHATS_NEW_SEEN_KEY,
  WHATS_NEW_STRINGS,
} from '../../src/web/whats-new.js';
import { ICON_SHAPES } from '../../src/web/icons.js';

const VERSION = '0.43.0';

/** Boots the shell and the What's new chunk on a version already seen, so
 *  the message stays shut and only its Settings row is drawn. */
function boot(): void {
  document.open();
  document.write(renderShell());
  document.close();
  globalThis.fetch = vi.fn(async () => ({
    ok: true,
    json: async () => ({}),
  })) as unknown as typeof fetch;
  new Function(clientJs())();
  new Function(whatsNewClientJs(VERSION))();
}

const reset = (): HTMLButtonElement => document.getElementById('prefs-reset') as HTMLButtonElement;
const whatsNew = (): HTMLButtonElement =>
  document.querySelector('#settings-menu .wn-menu-btn') as HTMLButtonElement;

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

function switchTo(lang: 'en' | 'he'): void {
  (document.querySelector(`[data-lang-btn="${lang}"]`) as HTMLButtonElement).click();
}

describe('the Settings menu’s buttons lead with stroke icons (epic 0025)', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('ap-tour-seen', '1');
    localStorage.setItem(WHATS_NEW_SEEN_KEY, VERSION);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("leads Reset to defaults with rotate-ccw and What's new with sparkles, their words unchanged", () => {
    boot();

    expectIconed(reset(), 'rotate-ccw');
    expectIconed(whatsNew(), 'sparkles');
    expect(reset().textContent).toBe(STRINGS.en.prefsReset);
    expect(whatsNew().textContent).toBe(WHATS_NEW_STRINGS.en.menu);
  });

  it('a locale switch rewrites both buttons’ words and keeps both icons', async () => {
    boot();

    switchTo('he');
    expect(reset().textContent).toBe(STRINGS.he.prefsReset);
    await vi.waitFor(() => expect(whatsNew().textContent).toBe(WHATS_NEW_STRINGS.he.menu));
    expectIconed(reset(), 'rotate-ccw');
    expectIconed(whatsNew(), 'sparkles');

    switchTo('en');
    expect(reset().textContent).toBe(STRINGS.en.prefsReset);
    await vi.waitFor(() => expect(whatsNew().textContent).toBe(WHATS_NEW_STRINGS.en.menu));
    expectIconed(reset(), 'rotate-ccw');
    expectIconed(whatsNew(), 'sparkles');
  });

  it('Reset keeps its icon through a reset, and a click on the icon still opens What’s new', () => {
    boot();

    reset().click();
    expectIconed(reset(), 'rotate-ccw');
    expect(reset().textContent).toBe(STRINGS.en.prefsReset);

    expect(document.querySelector('.wn-dialog')).toBeNull();
    whatsNew().firstElementChild!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(document.querySelector('.wn-dialog')).not.toBeNull();
  });

  it('spaces each icon from its words', () => {
    expect(layoutCss()).toContain('#prefs-reset > .icon { margin-inline-end: 0.35em; }');
    expect(whatsNewCss()).toContain('.wn-menu-btn > .icon { margin-inline-end: 0.35em; }');
  });

  it('leaves the open menu axe-clean (WCAG A/AA)', async () => {
    boot();
    const menu = document.getElementById('settings-menu') as HTMLDetailsElement;
    menu.open = true;

    const results = await axe.run(menu, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(results.violations).toEqual([]);
  });
});
