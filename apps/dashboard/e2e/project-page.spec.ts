// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { test, expect } from '@playwright/test';

/**
 * Real-browser coverage of `GET /p/:id` (`server/routes.ts` renders the same
 * shell, anchored via `data-project`; the client's `renderProjectPage`
 * — `web/shell.ts` — does the rest). Deliberately deferred in the E2E suite's
 * first slice (dashboard.spec.ts, web-msnsndgx-7qmbs1) alongside visual
 * regression; this closes the project-page half of that gap without touching
 * the still-unsolved cross-platform screenshot-baseline problem.
 *
 * The e2e fixture (`e2e-server.ts`) intentionally seeds zero projects (the
 * boot-smoke suite depends on that for its first-run-tour coverage), so this
 * hits the route with an id no project has — the route's own honest
 * "not found" branch, not a client-side 404. Unlike the fleet root, the
 * first-run tour never auto-opens here: `startFleetStream`'s render loop
 * returns as soon as `document.body.dataset.project` is set, before the
 * tour-triggering `state.empty` branch runs — so no tour-seen seeding needed.
 */
test.describe('project page (/p/:id)', () => {
  test('renders an honest not-found state in a real browser with no unexpected errors', async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));
    const badResponses: string[] = [];
    page.on('response', (res) => {
      if (res.status() >= 400) badResponses.push(`${res.status()} ${new URL(res.url()).pathname}`);
    });

    const response = await page.goto('/p/e2e-no-such-project');

    await expect(page).toHaveTitle(/AUTOPILOT/);
    const main = page.locator('main#fleet');
    await expect(main).toBeVisible();
    await expect(main).toHaveClass(/project-mode/);
    await expect(main.locator('h2')).toHaveText('Project not found');
    const backLink = main.locator('a[href="/"]');
    await expect(backLink).toBeVisible();
    await expect(backLink).toContainText('Fleet');
    expect(response?.headers()['content-security-policy']).toContain("default-src 'self'");
    expect(pageErrors).toEqual([]);
    // Same shared header chrome as the fleet root — its connection/flight/gh/
    // gh-lts/pool-client/pr-review status polls 404 for the same reason (see
    // dashboard.spec.ts).
    expect(badResponses.sort()).toEqual([
      '404 /api/connection',
      '404 /api/connection/gh',
      '404 /api/connection/gh-lts',
      '404 /api/fly',
      '404 /api/pool-client',
      '404 /api/pr-review',
      // publicity self-init poll — the panel extracted to web/features/ (epic
      // 0007 slice 7); the e2e server wires no publicity API by design.
      '404 /api/publicity',
    ]);
  });

  test('the "← Fleet" link is reachable by keyboard alone and returns to the fleet root', async ({
    page,
  }) => {
    await page.goto('/p/e2e-no-such-project');
    const backLink = page.locator('main#fleet a[href="/"]');

    // 40, not 20: the shared header chrome now carries the fleet summary's
    // tooltip-bearing stat tiles (App-wide interactivity audit, web-msm66jlc-*),
    // each keyboard-focusable via tabindex="0" ahead of this link in tab order.
    let reached = false;
    for (let i = 0; i < 40 && !reached; i++) {
      await page.keyboard.press('Tab');
      reached = await backLink.evaluate((el) => el === document.activeElement);
    }
    expect(reached).toBe(true);

    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('main#fleet')).not.toHaveClass(/project-mode/);
  });
});
