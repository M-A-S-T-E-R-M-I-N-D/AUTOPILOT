// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * `apps/dashboard/src/read/reconcile.ts`-only Vitest config, used exclusively
 * by Stryker (stryker.dashboard-reconcile.config.mjs) — NOT wired into `pnpm
 * run test`, which keeps using the root config's full-workspace run.
 *
 * Mirrors vitest.dashboard-flightlog.config.ts's reasoning: reconcile.ts only
 * imports a type (`TaskEntry` from fleet.js, erased at compile time — no
 * runtime `@autopilot/store` or better-sqlite3 load) and its test file
 * imports nothing but vitest and reconcile.js/fleet.js's types, so scoping to
 * just that one file sidesteps the root config's jsdom env-matching and the
 * rest of the dashboard suite entirely, keeping every mutant's rerun fast.
 */
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  root: repoRoot,
  test: {
    globals: false,
    environment: 'node',
    include: ['apps/dashboard/test/read/reconcile.test.ts'],
  },
});
