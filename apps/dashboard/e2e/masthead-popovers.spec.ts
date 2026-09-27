// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { test, expect } from '@playwright/test';
import { skipFirstRunTour } from './helpers.js';

/**
 * THE MASTHEAD POPOVER BEHAVIOR LAWS (epic 0017 addendum) in a real browser.
 * The census and the icon-cluster tests pin the MARKUP — every popover
 * carries name="masthead-popover" — but jsdom has no exclusive-accordion
 * behaviour, so markup alone never proved theme and language cannot stack
 * open (the 2026-09-07 operator catch). These specs drive Chromium, where
 * the native <details name> contract and web/features/popovers.ts both run.
 * The laws themselves are written in docs/epics/0017-navigation-remake.md.
 */
const OPEN_POPOVERS = 'details[name="masthead-popover"][open]';

test.beforeEach(async ({ page }) => {
  await skipFirstRunTour(page);
  await page.goto('/');
});

test('opening one popover by keyboard closes the other — the native name contract, no pointer involved', async ({
  page,
}) => {
  await page.locator('#theme-menu-summary').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#theme-menu')).toHaveAttribute('open', '');

  await page.locator('#lang-menu-summary').focus();
  await page.keyboard.press('Enter');

  await expect(page.locator('#lang-menu')).toHaveAttribute('open', '');
  await expect(page.locator('#theme-menu')).not.toHaveAttribute('open');
  await expect(page.locator(OPEN_POPOVERS)).toHaveCount(1);
});

test('opening one popover by pointer closes the other', async ({ page }) => {
  await page.locator('#theme-menu-summary').click();
  await expect(page.locator('#theme-menu')).toHaveAttribute('open', '');

  await page.locator('#lang-menu-summary').click();

  await expect(page.locator('#lang-menu')).toHaveAttribute('open', '');
  await expect(page.locator('#theme-menu')).not.toHaveAttribute('open');
  await expect(page.locator(OPEN_POPOVERS)).toHaveCount(1);
});

test('Escape closes the open popover and returns focus to its summary', async ({ page }) => {
  const summary = page.locator('#lang-menu-summary');
  await summary.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#lang-menu')).toHaveAttribute('open', '');
  // Move focus INTO the panel first, so the return is a real move, not a no-op.
  await page.locator('#lang-menu [data-lang-btn]').first().focus();

  await page.keyboard.press('Escape');

  await expect(page.locator(OPEN_POPOVERS)).toHaveCount(0);
  await expect(summary).toBeFocused();
});

test('a keyboard choice closes its popover and returns focus to the summary, not to <body>', async ({
  page,
}) => {
  const summary = page.locator('#theme-menu-summary');
  await summary.focus();
  await page.keyboard.press('Enter');
  await page.locator('[data-theme-btn="light"]').focus();

  await page.keyboard.press('Enter');

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('#theme-menu')).not.toHaveAttribute('open');
  await expect(summary).toBeFocused();
});

for (const menu of ['theme-menu', 'lang-menu'] as const) {
  test(`the ${menu} panel sizes to its pill row — no empty box trailing the last pill`, async ({
    page,
  }) => {
    await page.locator(`#${menu}-summary`).focus();
    await page.keyboard.press('Enter');
    const panel = page.locator(`#${menu} > .connect-body`);
    await expect(panel).toBeVisible();

    // The gap between the pill row's inline-end and the panel's content-box
    // inline-end, in CSS pixels. At the old fixed 320px connect-panel width a
    // short row "swam" at the start of a mostly empty box; max-content leaves
    // no gap at all. Direction-neutral: measured toward inline-end in LTR and
    // RTL alike.
    const trailingGap = await panel.evaluate((el) => {
      const pills = el.querySelectorAll('.switch > button');
      const last = pills[pills.length - 1];
      if (!last) return Number.NaN;
      const style = getComputedStyle(el);
      const box = el.getBoundingClientRect();
      const pill = last.getBoundingClientRect();
      if (style.direction === 'rtl') {
        const contentStart =
          box.left + parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft);
        return pill.left - contentStart;
      }
      const contentEnd =
        box.right - parseFloat(style.borderRightWidth) - parseFloat(style.paddingRight);
      return contentEnd - pill.right;
    });
    expect(trailingGap).toBeGreaterThanOrEqual(-1);
    expect(trailingGap).toBeLessThanOrEqual(1);
  });
}
