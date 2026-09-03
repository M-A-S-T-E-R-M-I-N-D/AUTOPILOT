// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * `apps/dashboard/src/read/backups.ts`-only Vitest config, used exclusively
 * by Stryker (stryker.dashboard-backups.config.mjs) — NOT wired into `pnpm
 * run test`, which keeps using the root config's full-workspace run.
 *
 * Mirrors vitest.dashboard-anomalies.config.ts's reasoning: backups.ts
 * imports only a `type` from `@autopilot/store` (erased at compile, no
 * runtime better-sqlite3 load) and its test file imports nothing but vitest
 * and backups.js, so scoping to just that one file sidesteps the root
 * config's jsdom env-matching and the rest of the dashboard suite entirely,
 * keeping every mutant's rerun fast.
 */
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  root: repoRoot,
  test: {
    globals: false,
    environment: 'node',
    include: ['apps/dashboard/test/read/backups.test.ts'],
    // Real git subprocesses flake under the 5s default (see vitest.config.ts).
    testTimeout: 30_000,
  },
});
