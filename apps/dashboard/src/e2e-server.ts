// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Playwright's `webServer` entry (`apps/dashboard/e2e/playwright.config.ts`) —
 * boots the REAL server (real routes, real security headers, real client
 * bundle) with NO store dependency: `buildFleetView(now, [])` is the exact
 * same production code path a genuinely fresh install renders (zero
 * onboarded projects), so E2E gets deterministic content without seeding or
 * copying a database. Listens on a fixed port distinct from `DEFAULT_PORT`
 * (4317) so it never collides with a real dashboard instance already running
 * on this machine.
 */

import { createServer, LOOPBACK_HOST } from './server/server.js';
import { buildFleetView } from './read/fleet.js';

/** Must match `apps/dashboard/e2e/playwright.config.ts`'s `PORT`. */
export const E2E_PORT = 4319;

const server = createServer({ readState: () => buildFleetView(Date.now(), []) });
server.listen(E2E_PORT, LOOPBACK_HOST, () => {
  process.stdout.write(`AUTOPILOT e2e dashboard → http://${LOOPBACK_HOST}:${E2E_PORT}\n`);
});
