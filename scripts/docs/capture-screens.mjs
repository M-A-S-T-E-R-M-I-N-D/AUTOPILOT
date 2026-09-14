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
 * What is real and what is staged, so the README never overclaims:
 * - The page, the client bundle, the fleet and the project are the fixture's
 *   own (`apps/dashboard/src/e2e-server-populated.ts`), rendered by the real
 *   server with the browser clock frozen at the fixture's instant.
 * - The fixture wires neither the flight API nor the Lucky roll, so the three
 *   Fly-bar frames answer `/api/fly` and `/api/lucky` from the hand-authored
 *   payloads below, shaped exactly like `flight/runner.ts`'s FlightStatus and
 *   `server/server.ts`'s LuckyResponse; the running frame also prepends one
 *   completed firing to the flying project's log so the progress line reads
 *   one of four. The folder is a neutral `~/src/checkout-web`, never a real
 *   operator path.
 */

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const require = createRequire(join(ROOT, 'apps', 'dashboard', 'package.json'));
const { chromium } = require('@playwright/test');

const BASE = 'http://127.0.0.1:4320';
/** Must equal the fixture's fixed NOW and playwright.config.ts's POPULATED_NOW. */
const NOW = Date.parse('2026-09-01T12:00:00.000Z');
const MINUTE = 60_000;
const OUT = process.argv[2] || join(ROOT, 'docs', 'screens');
const FOLDER = '~/src/checkout-web';
const VIEWPORT = { width: 1440, height: 1030 };

const idleFlight = {
  running: false,
  folder: null,
  firings: null,
  totalBudgetUsd: null,
  startedAt: null,
  pid: null,
  paused: false,
  queued: false,
  maxTurnsPerFiring: 40,
  flights: [],
};
const liveFlight = {
  folder: FOLDER,
  firings: 4,
  running: true,
  queued: false,
  totalBudgetUsd: null,
  initiatedBy: 'dashboard',
  startedAt: NOW - 3 * MINUTE,
  pid: 31337,
};
const runningFlight = {
  ...idleFlight,
  running: true,
  folder: FOLDER,
  firings: 4,
  startedAt: NOW - 3 * MINUTE,
  pid: 31337,
  flights: [liveFlight],
};
const shippedFiring = {
  id: 'firing-live-0',
  item: 'task-1',
  kind: 'feature',
  sha: '7f3e9c1',
  shipped: true,
  gateResult: 'passed',
  cost: 2.14,
  tokensIn: 41_000,
  tokensOut: 9_000,
  turns: 22,
  commitSubject: 'feat: apply stacked discount codes in a deterministic order',
  completion: 'complete',
  failedCheck: null,
  died: null,
  at: NOW - 1 * MINUTE,
  durationMs: 2 * MINUTE,
};
const luckyRoll = {
  probe: { cpuLoadPct: 23, logicalCores: 12, freeRamGb: 19.4, queuedTasks: 7, runningFlights: 0 },
  plan: {
    ok: true,
    lanes: 2,
    firings: 4,
    budgetUsd: 10,
    reasoning: [
      'CPU: 23% load on 12 cores leaves ~9.2 idle → 3 lane(s) at 3 cores each',
      'RAM: 19.4 GB free minus 4 GB reserved → 10 lane(s) at 1.5 GB each',
      'board: 7 queued task(s) → 3 lane(s) at ≥2 tasks each',
      'rolled: 2 lane(s) × 4 firing(s) at $10/firing (cap 8 lanes)',
    ],
  },
  fit: {
    attention: 'evening',
    considered: 14,
    shortlist: [
      {
        number: 48,
        title: 'Stacked discount codes apply in the wrong order',
        url: 'https://github.com/example/checkout-web/issues/48',
        source: 'pool',
        fit: 0.91,
        reasoning:
          'good first issue + help wanted; touches src/checkout.ts, flown here twice; sized for one evening',
      },
      {
        number: 51,
        title: 'Cart totals drift by a cent on mixed-currency lines',
        url: 'https://github.com/example/checkout-web/issues/51',
        source: 'pool',
        fit: 0.84,
        reasoning: 'help wanted; two firings of history on src/cart.ts; nobody assigned',
      },
      {
        number: 37,
        title: 'Document the checkout webhook retry policy',
        url: 'https://github.com/example/checkout-web/issues/37',
        source: 'people',
        fit: 0.72,
        reasoning: 'docs only; unassigned for 9 days; fits an evening with room to spare',
      },
    ],
  },
};

/**
 * @param {import('@playwright/test').Browser} browser
 * @param {{ theme: 'dark' | 'light', path?: string, flight?: object, stageProgress?: boolean }} opts
 */
async function open(browser, { theme, path = '/', flight = idleFlight, stageProgress = false }) {
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 2,
    colorScheme: theme,
    locale: 'en-US',
  });
  const page = await context.newPage();
  await page.addInitScript((t) => localStorage.setItem('ap-theme', t), theme);
  await page.clock.install({ time: NOW + 2 * MINUTE });
  await page.route(
    (u) => u.pathname === '/api/fly',
    (route) => route.fulfill({ json: flight }),
  );
  await page.route(
    (u) => u.pathname === '/api/lucky',
    (route) => route.fulfill({ json: luckyRoll }),
  );
  if (stageProgress) {
    await page.route(
      (u) => u.pathname === '/api/state',
      async (route) => {
        const state = await (await route.fetch()).json();
        const projects = state.projects.map((p) =>
          p.status === 'flying' ? { ...p, flightLog: [shippedFiring, ...(p.flightLog || [])] } : p,
        );
        await route.fulfill({ json: { ...state, projects } });
      },
    );
  }
  await page.goto(BASE + path);
  await page.clock.runFor(3000);
  await page.evaluate('document.fonts.ready');
  return { context, page };
}

/** Frames an element exactly (its own padding is the margin). */
async function clip(page, selector, file) {
  const box = await page.locator(selector).boundingBox();
  if (!box) throw new Error(`nothing to frame at ${selector}`);
  await page.screenshot({ path: file, clip: box });
  console.log('wrote', file, `${Math.round(box.width)}×${Math.round(box.height)}`);
}

async function settle(page, ms = 300) {
  await page.mouse.move(5, 5);
  await page.clock.runFor(ms);
}

const browser = await chromium.launch();
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
  ({ context, page } = await open(browser, { theme: 'dark', path: '/p/demo-checkout-web' }));
  await page.clock.runFor(2000);
  await page.screenshot({ path: join(OUT, 'project-dark.png') });
  console.log('wrote project-dark.png');
  await context.close();
} finally {
  await browser.close();
}
