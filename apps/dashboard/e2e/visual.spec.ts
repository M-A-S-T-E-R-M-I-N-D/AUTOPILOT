// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { test, expect } from '@playwright/test';
import { skipFirstRunTour, setTheme } from './helpers.js';

/**
 * Visual regression for the fleet root and the project page, in both themes
 * the operator actually switches between (`terminal` is a third supported
 * theme but out of scope for this baseline — see the theme switcher,
 * `switcherJs()` in `apps/dashboard/src/web/shell.ts`). Baselines are
 * platform-suffixed by Playwright itself (`toHaveScreenshot`'s default
 * snapshot naming includes the OS), so a future CI runner on a different
 * platform grows its own baseline on first run rather than colliding with
 * this one — no cross-platform font-rendering assumption required.
 *
 * `#updated` renders a live "updated Xs ago" relative-timestamp
 * (`renderFleet` in `shell.ts`) that changes every tick; it's masked out
 * rather than asserted on, since exact elapsed seconds isn't the thing this
 * suite is protecting.
 */
const THEMES = ['dark', 'light'] as const;

test.describe('visual regression', () => {
  for (const theme of THEMES) {
    test(`fleet page — ${theme} theme`, async ({ page }) => {
      await skipFirstRunTour(page);
      await setTheme(page, theme);
      await page.goto('/');

      const html = page.locator('html');
      await expect(html).toHaveAttribute('data-theme', theme);
      await expect(page.locator('main#fleet')).toBeVisible();
      await expect(page.locator('#updated')).not.toHaveText('connecting…');

      await expect(page).toHaveScreenshot(`fleet-${theme}.png`, {
        fullPage: true,
        mask: [page.locator('#updated')],
      });
    });

    test(`project page — ${theme} theme`, async ({ page }) => {
      await setTheme(page, theme);
      await page.goto('/p/e2e-no-such-project');

      const html = page.locator('html');
      await expect(html).toHaveAttribute('data-theme', theme);
      await expect(page.locator('main#fleet')).toHaveClass(/project-mode/);
      await expect(page.locator('#updated')).not.toHaveText('connecting…');

      await expect(page).toHaveScreenshot(`project-${theme}.png`, {
        fullPage: true,
        mask: [page.locator('#updated')],
      });
    });
  }
});
