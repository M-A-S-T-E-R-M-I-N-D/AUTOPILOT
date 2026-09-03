// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * `apps/dashboard/src/read/flightlog.ts`-only Vitest config, used exclusively
 * by Stryker (stryker.dashboard-flightlog.config.mjs) — NOT wired into `pnpm
 * run test`, which keeps using the root config's full-workspace run.
 *
 * Mirrors vitest.dashboard-backups.config.ts's reasoning: flightlog.ts
 * imports only `node:fs` (no `@autopilot/store`, no better-sqlite3 load) and
 * its test file imports nothing but vitest, `node:fs`/`node:path`/`node:os`,
 * and flightlog.js, so scoping to just that one file sidesteps the root
 * config's jsdom env-matching and the rest of the dashboard suite entirely,
 * keeping every mutant's rerun fast.
 */
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  root: repoRoot,
  test: {
    globals: false,
    environment: 'node',
    include: ['apps/dashboard/test/read/flightlog.test.ts'],
  },
});
