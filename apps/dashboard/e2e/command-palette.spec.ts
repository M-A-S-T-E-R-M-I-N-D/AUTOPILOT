// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { test, expect } from '@playwright/test';
import { skipFirstRunTour, setTheme } from './helpers.js';
import { POPULATED_BASE_URL, POPULATED_NOW } from './playwright.config.js';

/**
 * THE COMMAND PALETTE (epic 0021 slice 7, closing 0017 slice 4) in a real
 * browser: Ctrl+K opens a real <dialog> (showModal — focus trapped, Escape
 * native), typing filters the page's places, Enter switches the subject and
 * the dialog is gone. jsdom cannot prove showModal; this can.
 */
test('Ctrl+K → type a place → Enter lands on it', async ({ page }) => {
  await skipFirstRunTour(page);
  await setTheme(page, 'dark');
  await page.clock.install({ time: POPULATED_NOW + 2 * 60_000 });
  await page.goto(`${POPULATED_BASE_URL}/p/demo-checkout-web`);
  await page.clock.runFor(3000);
  await expect(page.locator('main#fleet')).toHaveClass(/project-mode/);

  await page.keyboard.press('Control+k');
  const dialog = page.locator('#palette');
  await expect(dialog).toBeVisible();
  await expect(page.locator('#palette-input')).toBeFocused();

  await page.keyboard.type('docs');
  await expect(page.locator('#palette-list li')).toHaveCount(1);
  await page.keyboard.press('Enter');

  await expect(dialog).toBeHidden();
  await expect(page.locator('body')).toHaveAttribute('data-subject', 'docs');
  await expect(page.locator('[data-subject-link="docs"]')).toHaveAttribute('aria-current', 'page');
});

test('the masthead’s ⌘K pill opens the same palette and Escape closes it', async ({ page }) => {
  await skipFirstRunTour(page);
  await setTheme(page, 'dark');
  await page.goto(POPULATED_BASE_URL);
  await page.locator('#palette-btn').click();
  await expect(page.locator('#palette')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#palette')).toBeHidden();
});
