// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { test, expect } from '@playwright/test';
import { skipFirstRunTour, setTheme } from './helpers.js';
import { POPULATED_BASE_URL, POPULATED_NOW } from './playwright.config.js';

/**
 * THE CONTEXT RAIL (epic 0021 slice 6) — desktop project only. The
 * chromium project's viewport is 1280px wide, exactly the `xl` breakpoint
 * (80rem), so this is the narrowest window that earns the supporting pane:
 * the lanes in flight and the Keeper queue sit beside the fleet page,
 * sticky, while the main column scrolls. A project page is tabs and never
 * grows one. Below xl the rail is hidden and every section is back where
 * the server rendered it (proved in `shell-tablet.spec.ts` at 1024).
 */
test.describe('app shell — context rail at xl', () => {
  test('the lanes and the Keeper queue sit beside the fleet page, and stay while it scrolls', async ({
    page,
  }) => {
    await skipFirstRunTour(page);
    await setTheme(page, 'dark');
    await page.clock.install({ time: POPULATED_NOW + 2 * 60_000 });
    await page.goto(POPULATED_BASE_URL);
    await page.clock.runFor(3000);
    await expect(page.locator('main#fleet')).toBeVisible();

    const rail = page.locator('#context-rail');
    await expect(rail).toBeVisible();
    await expect(page.locator('body')).toHaveAttribute('data-rail', 'on');
    // The moved sections are inside the aside, not body-level any more.
    await expect(page.locator('#context-rail > #live-workers')).toHaveCount(1);
    await expect(page.locator('#context-rail > #pool-client-panel')).toHaveCount(1);
    await expect(page.locator('#context-rail > #pr-review-panel')).toHaveCount(1);

    // Beside, not below: the rail's left edge is at (or past) the main column's right edge.
    const main = (await page.locator('main#fleet').boundingBox())!;
    const box = (await rail.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(main.x + main.width - 1);
    // The masthead spans both columns: it is wider than the main column.
    const masthead = (await page.locator('.masthead').boundingBox())!;
    expect(masthead.width).toBeGreaterThan(main.width + 1);
    // ...and above the content, never pushed below the first section (the
    // grid must not leave an empty first row for auto-placement to fill).
    const totals = (await page.locator('#totals').boundingBox())!;
    expect(masthead.y + masthead.height).toBeLessThanOrEqual(totals.y + 1);

    // Sticky: after scrolling the page, the rail is still at the top of the viewport.
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const after = (await rail.boundingBox())!;
    expect(after.y).toBeGreaterThanOrEqual(-1);
    expect(after.y).toBeLessThanOrEqual(1);
  });

  test('a project page is tabs and has no rail', async ({ page }) => {
    await skipFirstRunTour(page);
    await setTheme(page, 'dark');
    await page.clock.install({ time: POPULATED_NOW + 2 * 60_000 });
    await page.goto(`${POPULATED_BASE_URL}/p/demo-checkout-web`);
    await page.clock.runFor(3000);
    await expect(page.locator('main#fleet')).toHaveClass(/project-mode/);
    await expect(page.locator('#context-rail')).toHaveCount(0);
    await expect(page.locator('body')).not.toHaveAttribute('data-rail', 'on');
  });
});
