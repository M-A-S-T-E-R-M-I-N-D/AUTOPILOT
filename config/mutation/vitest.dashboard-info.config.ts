// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * `apps/dashboard/src/info.ts`-only Vitest config, used exclusively by
 * Stryker (stryker.dashboard-info.config.mjs) — NOT wired into `pnpm run
 * test`, which keeps using the root config's full-workspace run.
 *
 * Mirrors vitest.dashboard-backlog.config.ts's reasoning: info.ts has zero
 * imports (a fully self-contained pure module — see its own file header)
 * and is exercised with concrete expected-output assertions by
 * info.test.ts, covering the full dashboardInfo() descriptor, the exact
 * DASHBOARD_SCREENS array, and both version constants. Scoping to just that
 * one test file sidesteps the root config's jsdom env-matching and the rest
 * of the dashboard suite entirely, keeping every mutant's rerun fast.
 */
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  root: repoRoot,
  test: {
    globals: false,
    environment: 'node',
    include: ['apps/dashboard/test/info.test.ts'],
  },
});
