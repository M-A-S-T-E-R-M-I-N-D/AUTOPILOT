// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { skipFirstRunTour, setTheme } from './helpers.js';
import { POPULATED_BASE_URL, POPULATED_NOW } from './playwright.config.js';

/**
 * THE APP SHELL ON A TABLET (epic 0021) — runs under the two tablet
 * Playwright projects only (iPad Mini profile on chromium: 768×1024
 * portrait = the `md` regime, 1024×768 landscape = the `lg` regime; touch,
 * coarse pointer). One file, two regimes: each test reads the viewport and
 * asserts what THAT width owes the reader.
 *
 * md (portrait): the subject nav is a rail on the inline-start edge, one
 * subject renders at a time, Fly is one tap away.
 * lg (landscape): every subject stacks in DOM order and the rail is a
 * scroll-spy; no context rail yet (that is xl, 1280+).
 */
async function openFleet(page: Page): Promise<void> {
  await skipFirstRunTour(page);
  await setTheme(page, 'dark');
  await page.clock.install({ time: POPULATED_NOW + 2 * 60_000 });
  await page.goto(POPULATED_BASE_URL);
  await page.clock.runFor(3000);
  await expect(page.locator('main#fleet')).toBeVisible();
}

function isLandscape(page: Page): boolean {
  return page.viewportSize()!.width >= 1024;
}

test.describe('app shell — tablet', () => {
  test('the subject nav is a rail on the inline-start edge, full height, with thumb-sized targets', async ({
    page,
  }) => {
    await openFleet(page);
    const nav = page.locator('#subject-nav');
    await expect(nav).toBeVisible();
    const box = (await nav.boundingBox())!;
    const viewport = page.viewportSize()!;
    expect(box.x).toBeLessThanOrEqual(1);
    expect(box.width).toBeGreaterThanOrEqual(72);
    expect(box.width).toBeLessThanOrEqual(96);
    expect(box.height).toBeGreaterThanOrEqual(viewport.height - 1);
    for (const link of await page.locator('#subject-nav .subject-link').all()) {
      const b = (await link.boundingBox())!;
      expect(b.height, 'subject link height').toBeGreaterThanOrEqual(44);
      expect(b.width, 'subject link width').toBeGreaterThanOrEqual(44);
    }
    // Content starts to the right of the rail, never under it.
    const totals = (await page.locator('#totals').boundingBox())!;
    expect(totals.x).toBeGreaterThanOrEqual(box.x + box.width - 1);
  });

  test('portrait shows one subject at a time; landscape stacks every subject', async ({ page }) => {
    await openFleet(page);
    await expect(page.locator('#totals')).toBeVisible();
    if (isLandscape(page)) {
      await expect(page.locator('#searchbar')).toBeVisible();
      expect(await page.locator('[data-subject-inactive]').count()).toBe(0);
      // The empty line has no place on a stacked page.
      await expect(page.locator('#subject-empty')).toBeHidden();
    } else {
      await expect(page.locator('#searchbar')).toBeHidden();
      await page.locator('[data-subject-link="fly"]').tap();
      await expect(page.locator('body')).toHaveAttribute('data-subject', 'fly');
      await expect(page.locator('#searchbar')).toBeVisible();
      await expect(page.locator('#totals')).toBeHidden();
    }
  });

  test('no context rail below xl — every railed section is where the server put it', async ({
    page,
  }) => {
    await openFleet(page);
    await expect(page.locator('#context-rail')).toBeHidden();
    await expect(page.locator('body')).not.toHaveAttribute('data-rail', 'on');
    await expect(page.locator('body > #live-workers')).toHaveCount(1);
    await expect(page.locator('body > #pool-client-panel')).toHaveCount(1);
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

  test('visual — fleet populated, dark, tablet', async ({ page }) => {
    await openFleet(page);
    await expect(page.locator('#updated')).not.toHaveText('connecting…');
    await expect(page).toHaveScreenshot('fleet-populated-dark.png', {
      fullPage: true,
      mask: [
        page.locator('#updated'),
        page.locator('.gauge-label .muted'),
        page.locator('.live-worker-turns'),
        page.locator('.live-worker-progress-label'),
      ],
      maxDiffPixels: 2500,
    });
  });
});
