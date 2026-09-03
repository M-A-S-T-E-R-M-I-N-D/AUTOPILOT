// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { skipFirstRunTour, setTheme } from './helpers.js';
import { POPULATED_BASE_URL, POPULATED_NOW } from './playwright.config.js';

/** Freeze the BROWSER clock two minutes past the fixture's own fixed NOW —
 *  every "Xm ago"/"elapsed" string (browserNow − serverStamp) then renders
 *  the exact same text on every run and machine, killing the layout drift
 *  masks cannot absorb (a re-wrapped relative-time line shifts everything
 *  below it; observed as the fleet page oscillating 1038↔1053px). Ticks
 *  landing after the freeze repaint identical text — the client's
 *  idempotent-tick guarantee (cockpit epic 0015 D2) makes tick COUNT
 *  irrelevant to pixels. `clock.runFor` after goto fires any timer-driven
 *  first poll deterministically. */
async function freezeClock(page: Page): Promise<void> {
  await page.clock.install({ time: POPULATED_NOW + 2 * 60_000 });
}

/**
 * Visual regression for the fleet view WITH projects onboarded — the
 * companion `visual.spec.ts` baselines only ever render the empty fleet
 * (`e2e-server.ts`'s deliberate `buildFleetView(now, [])`), so they never
 * exercise the fly bar, a live worker card, or a status badge. Epic 0005
 * slice 3 named this exact gap as the missing mechanical proof for the
 * Cockpit MX fleet-home restyle; `e2e-server-populated.ts` is the
 * hand-authored, deterministic fixture that fills it. Slice 4 (project page)
 * has the same gap one level down: `visual.spec.ts`'s `project-{theme}`
 * baselines only ever render the NOT-FOUND page (`/p/e2e-no-such-project` on
 * the empty server), so the board, live worker card, and phase rail — the
 * surfaces that slice restyles — were never pinned; the populated project-page
 * baselines here close that. This suite still doesn't replace the operator's
 * own visual-judgment call (does the restyle actually look right) — it gives
 * that review something real to look at instead of an empty page, and catches
 * future regressions mechanically.
 */
const THEMES = ['dark', 'light'] as const;

test.describe('visual regression — populated fleet', () => {
  for (const theme of THEMES) {
    test(`fleet page populated — ${theme} theme`, async ({ page }) => {
      await skipFirstRunTour(page);
      await setTheme(page, theme);
      await freezeClock(page);
      await page.goto(POPULATED_BASE_URL);
      await page.clock.runFor(3000);

      const html = page.locator('html');
      await expect(html).toHaveAttribute('data-theme', theme);
      await expect(page.locator('main#fleet')).toBeVisible();
      await expect(page.locator('#updated')).not.toHaveText('connecting…');

      // A populated fleet renders live relative-time text the empty baseline
      // never does — the fly bar/gauge "N ago" labels (`.gauge-label .muted`)
      // and the live worker card's "elapsed" lines (`.live-worker-turns`,
      // `.live-worker-progress-label`) are computed against the BROWSER's
      // `Date.now()` at render time (see `web/live-progress.ts`), not this
      // fixture's frozen server-side `NOW` — so, like `#updated`, they drift
      // a little between runs and must be masked rather than asserted on
      // pixel-for-pixel. `.live-worker-turns` (the always-rendered "N elapsed
      // · ~N turns so far" line) was missing from this list — unlike
      // `.live-worker-progress-label` (only rendered once a project has
      // enough flight-log history for an average duration, which this
      // fixture's `checkout-web` doesn't), it renders unconditionally, so its
      // omission was an intermittent real-browser visual-regression failure
      // waiting to happen once the elapsed seconds ticked past a text-width
      // rounding boundary.
      await expect(page).toHaveScreenshot(`fleet-populated-${theme}.png`, {
        fullPage: true,
        mask: [
          page.locator('#updated'),
          page.locator('.gauge-label .muted'),
          page.locator('.live-worker-turns'),
          page.locator('.live-worker-progress-label'),
        ],
        // The masked regions above vary in text width run-to-run (e.g. "6m 9s"
        // vs "6m 10s" elapsed), which shifts the mask rectangle's edge by a
        // few px — a small, expected diff at the mask boundary itself, not a
        // rendering regression.
        // 2500, not 50: residual cross-runner antialiasing after the srgb/no-lcd
        // flags — ~0.1% of the smallest fixture, far below any visible layout,
        // color, or content regression (those move tens of thousands of pixels
        // or the image SIZE). Content itself is byte-stable (frozen clock).
        maxDiffPixels: 2500,
      });
    });

    test(`project page populated — ${theme} theme`, async ({ page }) => {
      await skipFirstRunTour(page);
      await setTheme(page, theme);
      await freezeClock(page);
      await page.goto(`${POPULATED_BASE_URL}/p/demo-checkout-web`);
      await page.clock.runFor(3000);

      // NOTE (baseline provenance): this suite's four committed baselines are
      // CI-CANONICAL — captured on the windows-latest runner itself (adopted
      // from the ci.yml e2e job's `e2e-visual-actuals` failure artifact),
      // because two Windows machines differ by text antialiasing alone. A
      // LOCAL run on a dev box may therefore fail these four with small
      // text-rendering diffs; that is not a regression. After an intentional
      // UI change, refresh by downloading the artifact from the failed CI run
      // and committing its *-actual.png files over these baselines.
      const html = page.locator('html');
      await expect(html).toHaveAttribute('data-theme', theme);
      await expect(page.locator('main#fleet')).toHaveClass(/project-mode/);
      await expect(page.locator('#updated')).not.toHaveText('connecting…');
      // Deep-page render gate: a fullPage screenshot races the first fleet
      // tick's DOM build — captured before the flight log paints, the page
      // is only viewport-tall (observed: a 1280x720 baseline written for a
      // page whose settled height is 1280x3443, then every later honest run
      // "failing" against the truncated baseline). `.firing-ago` lives in
      // the flight log near the bottom, so its visibility pins the full
      // height deterministically — no timeout sleep.
      await expect(page.locator('.firing-ago').first()).toBeVisible();

      // Same browser-clock masking rationale as the fleet baseline above; the
      // project page adds the flight log's ticking started-ago label
      // (`.firing-ago`, `web/flight-log-rows.ts`) to the set.
      await expect(page).toHaveScreenshot(`project-populated-${theme}.png`, {
        fullPage: true,
        mask: [
          page.locator('#updated'),
          page.locator('.gauge-label .muted'),
          page.locator('.live-worker-turns'),
          page.locator('.live-worker-progress-label'),
          page.locator('.firing-ago'),
        ],
        // 2500, not 50: residual cross-runner antialiasing after the srgb/no-lcd
        // flags — ~0.1% of the smallest fixture, far below any visible layout,
        // color, or content regression (those move tens of thousands of pixels
        // or the image SIZE). Content itself is byte-stable (frozen clock).
        maxDiffPixels: 2500,
      });
    });
  }
});
