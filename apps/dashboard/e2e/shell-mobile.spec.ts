// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { skipFirstRunTour, setTheme } from './helpers.js';
import { POPULATED_BASE_URL, POPULATED_NOW } from './playwright.config.js';

/**
 * THE APP SHELL ON A PHONE (epic 0021) — runs under the `mobile` Playwright
 * project only (Pixel 7 profile: 412px wide, touch, coarse pointer). The
 * desktop project ignores this file; `responsive.spec.ts` keeps the 320px
 * overflow assertion for both.
 *
 * What a phone must get that the desktop render cannot prove: the subject
 * bar sits in the thumb zone at ≥44px, exactly one subject renders at a
 * time, Fly is one tap away, a deep link lands on its subject, and every
 * visible control clears WCAG 2.5.8's 24px floor.
 */
async function openFleet(page: Page): Promise<void> {
  await skipFirstRunTour(page);
  await setTheme(page, 'dark');
  await page.clock.install({ time: POPULATED_NOW + 2 * 60_000 });
  await page.goto(POPULATED_BASE_URL);
  await page.clock.runFor(3000);
  await expect(page.locator('main#fleet')).toBeVisible();
}

test.describe('app shell — compact window', () => {
  test('the subject bar is fixed to the bottom edge with thumb-sized targets', async ({ page }) => {
    await openFleet(page);
    const nav = page.locator('#subject-nav');
    await expect(nav).toBeVisible();
    const box = (await nav.boundingBox())!;
    const viewport = page.viewportSize()!;
    expect(box.y + box.height).toBeCloseTo(viewport.height, 0);
    for (const link of await page.locator('#subject-nav .subject-link').all()) {
      const b = (await link.boundingBox())!;
      expect(b.height, 'subject link height').toBeGreaterThanOrEqual(44);
      expect(b.width, 'subject link width').toBeGreaterThanOrEqual(44);
    }
  });

  test('one subject at a time — Fly is one tap away and the fleet leaves the page', async ({
    page,
  }) => {
    await openFleet(page);
    await expect(page.locator('#totals')).toBeVisible();
    // The fly SUBJECT is the fly bar + the search bar. The fly bar reveals
    // itself only when GET /api/fly answers, which the populated e2e server
    // does not serve, so the search bar is the section that proves the
    // subject switched.
    await expect(page.locator('#searchbar')).toBeHidden();

    await page.locator('[data-subject-link="fly"]').tap();

    await expect(page.locator('body')).toHaveAttribute('data-subject', 'fly');
    await expect(page.locator('#searchbar')).toBeVisible();
    await expect(page.locator('#totals')).toBeHidden();
    await expect(page.locator('[data-subject-link="fly"]')).toHaveAttribute('aria-current', 'page');
    // The URL did not change: the tap switched a subject, it did not navigate.
    expect(new URL(page.url()).hash).toBe('');
  });

  test('a deep link lands on the subject that owns it', async ({ page }) => {
    await skipFirstRunTour(page);
    await setTheme(page, 'dark');
    await page.goto(`${POPULATED_BASE_URL}/#searchbar`);
    await expect(page.locator('body')).toHaveAttribute('data-subject', 'fly');
    await expect(page.locator('#searchbar')).toBeVisible();
  });

  test('the masthead stays under two rows', async ({ page }) => {
    await openFleet(page);
    const box = (await page.locator('.masthead').boundingBox())!;
    expect(box.height).toBeLessThanOrEqual(100);
  });

  test('every visible control clears the 24px floor (WCAG 2.5.8)', async ({ page }) => {
    await openFleet(page);
    const offenders = await page.evaluate(() => {
      const out: string[] = [];
      document.querySelectorAll('button, a[href], summary, select').forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return; // not rendered
        // Visually hidden until focused (the skip link: 1px, clipped) — not a
        // pointer target at all; it reveals itself at full size on focus.
        if (getComputedStyle(el).clipPath !== 'none') return;
        if (r.height < 24 || r.width < 24) {
          out.push(
            `${el.tagName.toLowerCase()}${el.className ? '.' + String(el.className).split(' ')[0] : ''} ${Math.round(r.width)}x${Math.round(r.height)}`,
          );
        }
      });
      return out;
    });
    expect(offenders).toEqual([]);
  });

  test('a project page is six tabs — Board is one tap away and Overview leaves the page', async ({
    page,
  }) => {
    await skipFirstRunTour(page);
    await setTheme(page, 'dark');
    await page.clock.install({ time: POPULATED_NOW + 2 * 60_000 });
    await page.goto(`${POPULATED_BASE_URL}/p/demo-checkout-web`);
    await page.clock.runFor(3000);
    await expect(page.locator('main#fleet')).toHaveClass(/project-mode/);
    await expect(page.locator('#subject-nav [data-subject-link]')).toHaveCount(6);
    // The project card paints after the fixture's first state fetch lands in
    // REAL time; under the CI runner's parallel load that once outran the
    // default 5s (passed on retry), so the first sighting gets a real budget.
    await expect(page.locator('main#fleet > .card[data-project]')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('main#fleet .task-add')).toBeHidden();

    await page.locator('[data-subject-link="board"]').tap();

    await expect(page.locator('body')).toHaveAttribute('data-subject', 'board');
    await expect(page.locator('main#fleet .task-add')).toBeVisible();
    await expect(page.locator('main#fleet > .card[data-project]')).toBeHidden();
  });

  test('focus mode: the chrome leaves, the exit pill stays reachable, a tap brings it back', async ({
    page,
  }) => {
    await openFleet(page);
    await page.locator('#focus-toggle').tap();
    await expect(page.locator('body')).toHaveAttribute('data-focus', 'on');
    await expect(page.locator('.masthead')).toBeHidden();
    await expect(page.locator('#subject-nav')).toBeHidden();
    const exit = page.locator('#focus-exit');
    await expect(exit).toBeVisible();
    const b = (await exit.boundingBox())!;
    expect(b.height).toBeGreaterThanOrEqual(44);
    await exit.tap();
    await expect(page.locator('.masthead')).toBeVisible();
    await expect(page.locator('#subject-nav')).toBeVisible();
  });

  test('an opened masthead popover is a sheet inside the viewport, in either direction', async ({
    page,
  }) => {
    await openFleet(page);
    for (const lang of ['en', 'he'] as const) {
      await page.evaluate((l) => {
        document.documentElement.lang = l;
        document.documentElement.dir = l === 'he' ? 'rtl' : 'ltr';
      }, lang);
      const connect = page.locator('#connect');
      await connect.locator('summary').tap();
      await expect(connect).toHaveAttribute('open', '');
      const body = (await connect.locator('.connect-body').boundingBox())!;
      const viewport = page.viewportSize()!;
      // RTL audit (2026-09-12): the anchored menu grew 166px past a Hebrew phone's edge.
      expect(body.x, `${lang} left edge`).toBeGreaterThanOrEqual(0);
      expect(body.x + body.width, `${lang} right edge`).toBeLessThanOrEqual(viewport.width + 1);
      await connect.locator('summary').tap();
      await expect(connect).not.toHaveAttribute('open', '');
    }
  });

  test('visual — fleet populated, dark, phone', async ({ page }) => {
    await openFleet(page);
    await expect(page.locator('#updated')).not.toHaveText('connecting…');
    await expect(page).toHaveScreenshot('fleet-populated-dark.png', {
      fullPage: true,
      mask: [
        page.locator('.gauge-label .muted'),
        page.locator('.live-worker-turns'),
        page.locator('.live-worker-progress-label'),
      ],
      maxDiffPixels: 2500,
    });
  });
});
