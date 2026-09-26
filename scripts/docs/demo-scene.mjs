// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * The staged scene the README's two doc generators share — `capture-screens.mjs`
 * (the stills under `docs/screens/`) and `record-demo-frames.mjs` (the demo's
 * frame sequence) — so both open the same page the same way and tell one
 * Lock on · Lucky · Fire story from one source.
 *
 * What is real and what is staged, so the README never overclaims:
 * - The page, the client bundle, the fleet and the project are the populated
 *   e2e fixture's own (`apps/dashboard/src/e2e-server-populated.ts`), rendered
 *   by the real server with the browser clock frozen at the fixture's instant.
 * - The fixture wires neither the flight API nor the Lucky roll, so the Fly-bar
 *   frames answer `/api/fly` and `/api/lucky` from the hand-authored payloads
 *   below, shaped exactly like `flight/runner.ts`'s FlightStatus and
 *   `server/server.ts`'s LuckyResponse; the running frame also prepends one
 *   completed firing to the flying project's log so the progress line reads
 *   one of four. The folder is a neutral `~/src/checkout-web`, never a real
 *   operator path.
 *
 * Imports nothing from Playwright: every function here takes the Browser or
 * Page its caller launched, so a unit test can import the payloads without a
 * browser on the machine.
 */

/** The populated fixture server (`e2e-server-populated.ts`'s E2E_POPULATED_PORT). */
export const BASE = 'http://127.0.0.1:4320';
/** Must equal the fixture's fixed NOW and playwright.config.ts's POPULATED_NOW. */
export const NOW = Date.parse('2026-09-01T12:00:00.000Z');
export const MINUTE = 60_000;
export const FOLDER = '~/src/checkout-web';
/** The stills' framing: the README's frames are captured at 1440×1030 @2×. */
export const STILL_VIEWPORT = { width: 1440, height: 1030 };
/** Every frame is a returning operator's view: the getting-started guide
 *  hidden, so the page shows the product rather than the checklist. */
export const RETURNING_OPERATOR = { 'ap-ob-snooze': 'forever' };

export const idleFlight = {
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
export const runningFlight = {
  ...idleFlight,
  running: true,
  folder: FOLDER,
  firings: 4,
  startedAt: NOW - 3 * MINUTE,
  pid: 31337,
  flights: [liveFlight],
};
export const shippedFiring = {
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
export const luckyRoll = {
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
 * Opens the fixture in a fresh context with the theme set, the clock frozen
 * and the staged routes in place; the caller owns the returned context.
 * @param {import('@playwright/test').Browser} browser
 * @param {{ theme?: 'dark' | 'light' | 'terminal', path?: string, flight?: object, stageProgress?: boolean, prefs?: object | null, storage?: Record<string, string>, viewport?: { width: number, height: number }, deviceScaleFactor?: number }} opts
 */
export async function open(
  browser,
  {
    theme = 'dark',
    path = '/',
    flight = idleFlight,
    stageProgress = false,
    prefs = null,
    storage = RETURNING_OPERATOR,
    viewport = STILL_VIEWPORT,
    deviceScaleFactor = 2,
  } = {},
) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor,
    colorScheme: theme === 'light' ? 'light' : 'dark',
    locale: 'en-US',
  });
  const page = await context.newPage();
  await page.addInitScript((t) => localStorage.setItem('ap-theme', t), theme);
  if (prefs) {
    await page.addInitScript((p) => localStorage.setItem('ap-prefs', p), JSON.stringify(prefs));
  }
  await page.addInitScript((entries) => {
    for (const [k, v] of Object.entries(entries)) localStorage.setItem(k, v);
  }, storage);
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

/** Lets the page settle: parks the pointer, then advances the frozen clock. */
export async function settle(page, ms = 300) {
  await page.mouse.move(5, 5);
  await page.clock.runFor(ms);
}
