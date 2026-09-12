// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { test, expect } from '@playwright/test';
import { skipFirstRunTour } from './helpers.js';

test.describe('dashboard boot smoke', () => {
  test('the shell loads in a real browser with no unexpected errors', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));
    const badResponses: string[] = [];
    page.on('response', (res) => {
      if (res.status() >= 400) badResponses.push(`${res.status()} ${new URL(res.url()).pathname}`);
    });

    await page.goto('/');

    await expect(page).toHaveTitle(/AUTOPILOT/);
    await expect(page.locator('main#fleet')).toBeVisible();
    await expect(page.locator('.brand')).toContainText('AUTOPILOT');
    expect(pageErrors).toEqual([]);
    // This fixture's server (e2e-server.ts) wires no connection/flight/gh/gh-lts/
    // pool-client/pr-review backend (each either spawns a real child process or
    // shells to a real CLI — out of scope for a hermetic boot smoke test), so the
    // client's own status polls for those subsystems 404 by design. Anything else
    // 404ing would be a regression.
    expect(badResponses.sort()).toEqual([
      // The KEEPER CI-status panel (a round-3 lane): unserved by the fixtures, like its
      // siblings; the list is alphabetical, so it leads.
      '404 /api/ci-status',
      '404 /api/connection',
      '404 /api/connection/gh',
      '404 /api/connection/gh-lts',
      // foundation donation-panel self-init poll (FOUNDATION 1/3) — the
      // hermetic fixture wires no donations backend; the panel treats the
      // 404 as "not configured" and stays hidden, same class as the rest.
      '404 /api/contributor-issues',
      '404 /api/donations',
      '404 /api/fly',
      '404 /api/pool-client',
      '404 /api/pr-review',
      // publicity self-init poll — the panel extracted to web/features/ (epic
      // 0007 slice 7); the e2e server wires no publicity API by design.
      '404 /api/publicity',
      '404 /api/social-identity',
      // update-banner self-init poll — the banner finally ships in panels.js
      // (the substitution-free-template discovery fix); update-check reads
      // release state from the outside world, out of scope here like the
      // rest. The client treats the 404 as "no update" and stays hidden.
      '404 /api/update-check',
    ]);
  });

  test('serves security headers over the real socket', async ({ page }) => {
    const response = await page.goto('/');
    expect(response?.headers()['content-security-policy']).toContain("default-src 'self'");
  });
});

test.describe('keyboard-only navigation', () => {
  test('the first tab stop is the skip link, and activating it moves focus to the main landmark', async ({
    page,
  }) => {
    await skipFirstRunTour(page);
    await page.goto('/');
    await page.keyboard.press('Tab');
    const skipLink = page.locator('.skip-link');
    await expect(skipLink).toBeFocused();
    await expect(skipLink).toHaveText(/skip to fleet/i);

    await page.keyboard.press('Enter');
    await expect(page.locator('main#fleet')).toBeFocused();
  });

  test('the theme switcher is reachable and operable by keyboard alone', async ({ page }) => {
    await skipFirstRunTour(page);
    await page.goto('/');
    const html = page.locator('html');
    await expect(html).toHaveAttribute('data-theme', 'dark');

    // The theme buttons now live inside the theme-menu popover (EPIC 0017
    // icon cluster) — reach and open its <summary> disclosure first, same as
    // any other masthead popover, before the buttons themselves are in the
    // tab order at all.
    const themeMenuSummary = page.locator('#theme-menu-summary');
    let reachedSummary = false;
    for (let i = 0; i < 20 && !reachedSummary; i++) {
      await page.keyboard.press('Tab');
      reachedSummary = await themeMenuSummary.evaluate((el) => el === document.activeElement);
    }
    expect(reachedSummary).toBe(true);
    await page.keyboard.press('Enter');
    await expect(page.locator('#theme-menu')).toHaveAttribute('open', '');

    const lightButton = page.locator('[data-theme-btn="light"]');
    // Real Tab traversal (not `.focus()`) — proves the control is actually
    // reachable in the page's natural tab order, not merely present in the DOM.
    let reached = false;
    for (let i = 0; i < 20 && !reached; i++) {
      await page.keyboard.press('Tab');
      reached = await lightButton.evaluate((el) => el === document.activeElement);
    }
    expect(reached).toBe(true);

    // A visible focus indicator (WCAG 2.4.7) — the global :focus-visible rule.
    const outlineStyle = await lightButton.evaluate((el) => getComputedStyle(el).outlineStyle);
    expect(outlineStyle).toBe('solid');

    await page.keyboard.press('Enter');
    await expect(html).toHaveAttribute('data-theme', 'light');
    await expect(lightButton).toHaveAttribute('aria-pressed', 'true');
  });
});
