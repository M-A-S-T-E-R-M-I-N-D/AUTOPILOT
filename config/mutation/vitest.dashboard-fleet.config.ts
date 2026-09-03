// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * `apps/dashboard/src/read/fleet.ts`-only Vitest config, used exclusively
 * by Stryker (stryker.dashboard-fleet.config.mjs) — NOT wired into `pnpm
 * run test`, which keeps using the root config's full-workspace run.
 *
 * Mirrors vitest.dashboard-reconcile.config.ts's reasoning: fleet.ts only
 * imports types from `@autopilot/store` (`ProjectStatus`, `DoraSnapshot`,
 * `GateParallelSavings`, erased at compile time) plus other pure local
 * modules (read/anomalies.js, shared/callsign.js, shared/turns.js,
 * shared/narrator.js, shared/flight-summary.js, shared/live-firing.js) — no
 * runtime `@autopilot/store` or better-sqlite3 load — and its test file
 * imports nothing but vitest and fleet.js, so scoping to just that one file
 * sidesteps the root config's jsdom env-matching and the rest of the
 * dashboard suite entirely, keeping every mutant's rerun fast.
 */
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  root: repoRoot,
  test: {
    globals: false,
    environment: 'node',
    include: ['apps/dashboard/test/read/fleet.test.ts'],
  },
});
