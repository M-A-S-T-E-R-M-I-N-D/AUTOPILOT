// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { test, expect } from '@playwright/test';
import { skipFirstRunTour, setTheme } from './helpers.js';
import { POPULATED_BASE_URL } from './playwright.config.js';

/**
 * Every other e2e spec drives the default `devices['Desktop Chrome']`
 * viewport (~1280px) — none of them would ever catch a control that only
 * overflows at the narrow end. This pins the smallest breakpoint this repo's
 * web testing rule names (320px) against the two pages with the richest UI
 * (populated fleet: fly bar + stat tiles; populated project: board + phase
 * rail), asserting the document never grows wider than its own viewport —
 * the mechanical signal for "nothing needs horizontal scrolling."
 */
const NARROW_VIEWPORT = { width: 320, height: 720 };

test.describe('responsive layout — 320px viewport', () => {
  test.use({ viewport: NARROW_VIEWPORT });

  test('the populated fleet page has no horizontal overflow', async ({ page }) => {
    await skipFirstRunTour(page);
    await setTheme(page, 'dark');
    await page.goto(POPULATED_BASE_URL);

    await expect(page.locator('main#fleet')).toBeVisible();
    await expect(page.locator('#updated')).not.toHaveText('connecting…');

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidth).toBeLessThanOrEqual(NARROW_VIEWPORT.width);
  });

  test('the populated project page has no horizontal overflow', async ({ page }) => {
    await skipFirstRunTour(page);
    await setTheme(page, 'dark');
    await page.goto(`${POPULATED_BASE_URL}/p/demo-checkout-web`);

    await expect(page.locator('main#fleet')).toHaveClass(/project-mode/);
    await expect(page.locator('#updated')).not.toHaveText('connecting…');

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidth).toBeLessThanOrEqual(NARROW_VIEWPORT.width);
  });
});
