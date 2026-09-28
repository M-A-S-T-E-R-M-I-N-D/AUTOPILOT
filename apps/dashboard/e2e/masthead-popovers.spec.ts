// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { test, expect, type Page } from '@playwright/test';
import { skipFirstRunTour } from './helpers.js';

/**
 * THE MASTHEAD POPOVER BEHAVIOR LAWS (epic 0017 addendum) in a real browser.
 * The census pins `name="masthead-popover"` on every masthead <details>, but
 * jsdom implements no exclusive-accordion — only a real engine can prove that
 * the shared name actually closes one popover when another opens. The theme
 * and language popovers once shipped stacking open on each other; these
 * tests are the behavior acceptance the epic's function census never had.
 */

const OPEN_POPOVERS = 'details[name="masthead-popover"][open]';

async function openMasthead(page: Page): Promise<void> {
  await skipFirstRunTour(page);
  await page.goto('/');
  await expect(page.locator('#theme-menu-summary')).toBeVisible();
}

test('by keyboard alone, opening the language popover closes the theme popover — the native name group, no script', async ({
  page,
}) => {
  await openMasthead(page);
  await page.locator('#theme-menu-summary').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#theme-menu')).toHaveAttribute('open', '');

  await page.locator('#lang-menu-summary').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#lang-menu')).toHaveAttribute('open', '');
  await expect(page.locator('#theme-menu')).not.toHaveAttribute('open');
  await expect(page.locator(OPEN_POPOVERS)).toHaveCount(1);
});

test('by pointer, clicking one popover then another leaves exactly one open, and it stays pinned', async ({
  page,
}) => {
  await page.clock.install();
  await openMasthead(page);
  await page.locator('#theme-menu-summary').click();
  await expect(page.locator('#theme-menu')).toHaveAttribute('open', '');

  await page.locator('#lang-menu-summary').click();
  const lang = page.locator('#lang-menu');
  await expect(lang).toHaveAttribute('open', '');
  await expect(lang).toHaveAttribute('data-pinned', '');
  await expect(page.locator(OPEN_POPOVERS)).toHaveCount(1);

  // A pinned popover outlives the hover grace (220ms) once the pointer moves on.
  await page.mouse.move(5, 400);
  await page.clock.runFor(400);
  await expect(lang).toHaveAttribute('open', '');
});

test('a hover alone opens a popover only until the pointer leaves and the grace runs out', async ({
  page,
}) => {
  await page.clock.install();
  await openMasthead(page);
  await page.locator('#theme-menu-summary').hover();
  const theme = page.locator('#theme-menu');
  await expect(theme).toHaveAttribute('data-hover', '');

  await page.mouse.move(5, 400);
  await page.clock.runFor(400);
  await expect(theme).not.toHaveAttribute('open');
});

test('Escape closes the open popover and returns focus to its summary', async ({ page }) => {
  await openMasthead(page);
  await page.locator('#theme-menu-summary').focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await expect(page.locator('#theme-menu [data-theme-btn]').first()).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(page.locator('#theme-menu')).not.toHaveAttribute('open');
  await expect(page.locator('#theme-menu-summary')).toBeFocused();
});

test('a keyboard choice closes the popover and returns focus to its summary, not to <body>', async ({
  page,
}) => {
  await openMasthead(page);
  await page.locator('#theme-menu-summary').focus();
  await page.keyboard.press('Enter');
  await page.locator('[data-theme-btn="light"]').focus();
  await page.keyboard.press('Enter');

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('#theme-menu')).not.toHaveAttribute('open');
  await expect(page.locator('#theme-menu-summary')).toBeFocused();
});

test('the theme and language panels hug their pill row instead of the 320px connect box', async ({
  page,
}) => {
  await openMasthead(page);
  for (const id of ['theme-menu', 'lang-menu']) {
    await page.locator(`#${id}-summary`).focus();
    await page.keyboard.press('Enter');
    const slack = await page.locator(`#${id} > .connect-body`).evaluate((body) => {
      const row = body.querySelector('.switch') as HTMLElement;
      const cs = getComputedStyle(body);
      const chrome = ['paddingLeft', 'paddingRight', 'borderLeftWidth', 'borderRightWidth']
        .map((k) => parseFloat(cs[k as 'paddingLeft']))
        .reduce((a, b) => a + b, 0);
      return body.getBoundingClientRect().width - chrome - row.getBoundingClientRect().width;
    });
    expect(Math.abs(slack), id).toBeLessThan(1);
  }
});
