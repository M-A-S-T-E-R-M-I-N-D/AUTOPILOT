// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { skipFirstRunTour } from './helpers.js';
import { POPULATED_BASE_URL, POPULATED_NOW } from './playwright.config.js';

/**
 * Epic 0018 "calm cockpit" slice 4, the ANTI-CLS BUDGET: slices 1-3 did the
 * layout-stability work (bounded scroll containers, docs-viewer/card state
 * surviving ticks); this is the mechanical fence that keeps it fixed
 * forever — "a panel never resizes the page" stops being a promise anyone
 * has to remember and becomes a test that goes red the day it regresses.
 */

/** Same fixed-clock rationale as visual-populated.spec.ts: every relative-
 *  time string must render identically on every run, or its re-wrapped
 *  width would itself register as a (legitimate, unrelated) layout shift. */
async function freezeClock(page: Page): Promise<void> {
  await page.clock.install({ time: POPULATED_NOW + 2 * 60_000 });
}

test('project page — 60s of fleet ticks plus a scroll cause zero layout shift', async ({
  page,
}) => {
  await skipFirstRunTour(page);
  await freezeClock(page);
  await page.goto(`${POPULATED_BASE_URL}/p/demo-checkout-web`);
  await page.clock.runFor(3000);

  // Deep-page render gate, same pumped-loop shape as
  // visual-populated.spec.ts's project-page test: the flight log's async
  // fetch must land and paint BEFORE the observer below starts counting, or
  // that first paint (not a tick) would be misread as a regression.
  let firingAgoVisible = false;
  for (let pump = 0; pump < 25 && !firingAgoVisible; pump++) {
    await page.clock.runFor(2000);
    firingAgoVisible = (await page.locator('.firing-ago').count()) > 0;
  }
  expect(firingAgoVisible, 'flight log never painted within 50s of pumped fake time').toBe(true);

  // Layout Instability API, installed only after the page has settled: sums
  // every shift's impact score, excluding any the browser attributes to
  // real user input (`hadRecentInput`) — the epic's own "outside the user's
  // own actions" carve-out for a click-driven, expected reflow (e.g. an
  // accordion opening). Nothing below performs a click, so this test's
  // budget is effectively total; the exclusion is here for whichever future
  // spec extends this pattern to an interactive scenario.
  await page.evaluate(() => {
    (window as unknown as { __clsScore: number }).__clsScore = 0;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const shift = entry as PerformanceEntry & { value: number; hadRecentInput: boolean };
        if (!shift.hadRecentInput) {
          (window as unknown as { __clsScore: number }).__clsScore += shift.value;
        }
      }
    }).observe({ type: 'layout-shift', buffered: false });
  });

  // 20 ticks x 3s = REFRESH_MS's own cadence (shell.ts) over 60s of fake
  // time — the exact "scripted 60s populated-flight" window the epic asks
  // for.
  for (let tick = 0; tick < 20; tick++) {
    await page.clock.runFor(3000);
  }

  // The epic's own "...scroll test": a scripted scroll down and back must
  // not itself move any content (the Layout Instability API already
  // excludes pure scroll-offset changes from scoring, but a poll tick
  // landing mid-scroll and reflowing a panel underneath the reader would
  // still show up here).
  await page.mouse.wheel(0, 2000);
  await page.clock.runFor(500);
  await page.mouse.wheel(0, -2000);
  await page.clock.runFor(500);

  const clsScore = await page.evaluate(
    () => (window as unknown as { __clsScore: number }).__clsScore,
  );
  expect(clsScore, 'tick/scroll-driven cumulative layout shift must stay at zero').toBe(0);
});
