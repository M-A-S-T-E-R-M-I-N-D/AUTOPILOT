// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Retakes every frame under `docs/screens/` from the populated e2e fixture
 * (epic 0030 slice 1). Run from the repo root after `pnpm run build`, with
 * NO fixture server already listening on 4320 (Playwright's local config
 * reuses a running one, and a stale process serves a stale build):
 *
 *   node apps/dashboard/dist/e2e-server-populated.js &
 *   node scripts/docs/capture-screens.mjs
 *
 * The scene — what is real, what is staged, and the payloads that stage it —
 * lives in `demo-scene.mjs`, shared with `record-demo-frames.mjs` so the
 * stills and the demo's frame sequence tell one story from one source.
 */

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { FOLDER, open, runningFlight, settle } from './demo-scene.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const require = createRequire(join(ROOT, 'apps', 'dashboard', 'package.json'));
const { chromium } = require('@playwright/test');

const OUT = process.argv[2] || join(ROOT, 'docs', 'screens');

/** Frames an element exactly (its own padding is the margin). */
async function clip(page, selector, file) {
  const box = await page.locator(selector).boundingBox();
  if (!box) throw new Error(`nothing to frame at ${selector}`);
  await page.screenshot({ path: file, clip: box });
  console.log('wrote', file, `${Math.round(box.width)}×${Math.round(box.height)}`);
}

// AP_CAPTURE_CHANNEL=msedge (or chrome) uses an installed browser when
// Playwright's own build is not downloaded on this machine.
const browser = await chromium.launch(
  process.env.AP_CAPTURE_CHANNEL ? { channel: process.env.AP_CAPTURE_CHANNEL } : {},
);
try {
  // 1 + 2 — lock on, then the Lucky roll.
  let { context, page } = await open(browser, { theme: 'dark' });
  await page.locator('#flightbar').waitFor({ state: 'visible' });
  await page.fill('#fly-folder', FOLDER);
  await page.locator('#fly-folder').blur();
  await settle(page);
  // Settings closed: the first impression is the row itself — folder, Lucky,
  // Fire, and the gear that holds the rest (epic 0031 era).
  await clip(page, '#flightbar', join(OUT, 'lock-on.png'));
  // …and open for the roll, so the numbers it fills are visible beside the
  // reasoning it gives.
  await page.click('#fly-options-toggle');
  await settle(page);
  await page.click('#fly-lucky');
  await page.locator('#fly-fit:not([hidden])').waitFor();
  await page.locator('#fly-go').blur(); // the roll hands focus to Fire; its tip would cover the folder
  await settle(page, 500);
  await clip(page, '#flightbar', join(OUT, 'lucky.png'));
  await context.close();

  // 3 — fire: the flight underway, one of four shipped.
  ({ context, page } = await open(browser, { theme: 'dark', flight: runningFlight, stageProgress: true }));
  await page.locator('#flightbar').waitFor({ state: 'visible' });
  await page.fill('#fly-folder', FOLDER);
  await page.click('#fly-options-toggle');
  await settle(page);
  await page.fill('#fly-firings', '4');
  await page.fill('#fly-lanes', '2');
  await page.locator('#fly-lanes').blur();
  await page.click('#fly-options-toggle');
  await settle(page, 4000);
  await clip(page, '#flightbar', join(OUT, 'fire.png'));
  await context.close();

  // The shell frames: the fleet home in dark and light, one project's cockpit.
  for (const [theme, file] of [
    ['dark', 'fleet-dark.png'],
    ['light', 'fleet-light.png'],
  ]) {
    ({ context, page } = await open(browser, { theme }));
    await page.locator('.project-card, .card').first().waitFor();
    await page.screenshot({ path: join(OUT, file) });
    console.log('wrote', file);
    await context.close();
  }
  // The terminal theme with every effect on — scanlines, glow, the HUD bar,
  // green phosphor — the look the evolution strip ends on (2026-09-25).
  ({ context, page } = await open(browser, {
    theme: 'terminal',
    prefs: { scanlines: 'on', glow: 'on', hud: 'shown', phosphor: 'green' },
  }));
  await page.locator('.project-card, .card').first().waitFor();
  await page.clock.runFor(2000);
  await page.screenshot({ path: join(OUT, 'fleet-terminal.png') });
  console.log('wrote fleet-terminal.png');
  await context.close();
  ({ context, page } = await open(browser, { theme: 'dark', path: '/p/demo-checkout-web' }));
  await page.clock.runFor(2000);
  await page.screenshot({ path: join(OUT, 'project-dark.png') });
  console.log('wrote project-dark.png');
  await context.close();
} finally {
  await browser.close();
}
