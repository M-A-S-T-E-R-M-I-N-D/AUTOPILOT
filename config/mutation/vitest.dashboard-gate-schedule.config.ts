// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * `apps/dashboard/src/flight/gate-schedule.ts`-only Vitest config, used
 * exclusively by Stryker (stryker.dashboard-gate-schedule.config.mjs) — NOT
 * wired into `pnpm run test`, which keeps using the root config's
 * full-workspace run.
 *
 * Mirrors vitest.dashboard-runner.config.ts's reasoning: gate-schedule.ts
 * has zero runtime imports (its only import is `import type`, erased at
 * compile time) and is exercised with concrete expected-output assertions by
 * gate-schedule.test.ts. Scoping to just that one test file sidesteps the
 * root config's jsdom env-matching and the rest of the dashboard suite
 * entirely, keeping every mutant's rerun fast.
 */
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  root: repoRoot,
  test: {
    globals: false,
    environment: 'node',
    include: ['apps/dashboard/test/flight/gate-schedule.test.ts'],
  },
});
