// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * EPIC 0017 nav remake, slice 1/5 continued (board web-mtq019pd-rj8dsn):
 * the theme and language switchers collapse from always-visible button rows
 * into the masthead's existing icon+popover idiom — the same `<details
 * class="connect">` disclosure `#connect`, `#notify`, and `#foundation`
 * already use — so the masthead reads as a uniform icon cluster, one
 * control per domain. `masthead-census.test.ts` already pins that the
 * underlying buttons and their aria wiring survive the move; this test pins
 * the disclosure shell itself so a later slice cannot silently revert the
 * switchers back to bare inline navs.
 */

import { describe, it, expect } from 'vitest';
import { renderShell } from '../../src/web/shell.js';

function mastheadHtml(): string {
  const html = renderShell();
  const start = html.indexOf('<header class="masthead">');
  const end = html.indexOf('</header>', start) + '</header>'.length;
  return html.slice(start, end);
}

describe('masthead icon cluster (EPIC 0017 slice 1/5) — theme/language as icon+popover menus', () => {
  const masthead = mastheadHtml();

  it('renders the theme switcher as an icon-triggered popover, matching the connect/notify/foundation idiom', () => {
    // name="masthead-popover" makes every masthead <details> a native
    // exclusive accordion — opening one closes the rest (operator catch,
    // 2026-09-07: theme + language popovers stacked open on each other).
    expect(masthead).toContain(
      '<details class="connect theme-menu" id="theme-menu" name="masthead-popover">',
    );
    expect(masthead).toContain(
      '<summary id="theme-menu-summary" aria-label="Theme" data-i18n-aria="themeNav" data-tip="Choose a color theme" data-i18n-tip="themeMenuTip">🎨</summary>',
    );
  });

  it('renders the language switcher as an icon-triggered popover, matching the connect/notify/foundation idiom', () => {
    expect(masthead).toContain(
      '<details class="connect lang-menu" id="lang-menu" name="masthead-popover">',
    );
    expect(masthead).toContain(
      '<summary id="lang-menu-summary" aria-label="Language" data-i18n-aria="languageNav" data-tip="Choose a language" data-i18n-tip="langMenuTip">🌐</summary>',
    );
  });

  it('keeps each button row inside a .connect-body popover panel, closed by default', () => {
    const themeIdx = masthead.indexOf('id="theme-menu"');
    const themeBodyIdx = masthead.indexOf('class="connect-body"', themeIdx);
    const themeButtonsIdx = masthead.indexOf('data-theme-btn=', themeBodyIdx);
    expect(themeBodyIdx).toBeGreaterThan(themeIdx);
    expect(themeButtonsIdx).toBeGreaterThan(themeBodyIdx);

    const langIdx = masthead.indexOf('id="lang-menu"');
    const langBodyIdx = masthead.indexOf('class="connect-body"', langIdx);
    const langButtonsIdx = masthead.indexOf('data-lang-btn=', langBodyIdx);
    expect(langBodyIdx).toBeGreaterThan(langIdx);
    expect(langButtonsIdx).toBeGreaterThan(langBodyIdx);

    expect(masthead).not.toContain('<nav class="switch"');
  });
});

describe('masthead popover exclusivity (operator catch 2026-09-07)', () => {
  it('every masthead <details> popover shares name="masthead-popover" — the native exclusive-accordion contract, so theme and language can never stack open on each other', () => {
    const masthead = mastheadHtml();
    const occurrences = masthead.split('name="masthead-popover"').length - 1;
    const detailsCount = masthead.split('<details ').length - 1;
    expect(occurrences).toBe(detailsCount);
    expect(occurrences).toBeGreaterThanOrEqual(5);
  });
});
