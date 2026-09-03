// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * `apps/dashboard/src/flight/runner.ts`-only Vitest config, used exclusively
 * by Stryker (stryker.dashboard-runner.config.mjs) — NOT wired into `pnpm run
 * test`, which keeps using the root config's full-workspace run.
 *
 * Mirrors vitest.dashboard-triage.config.ts's reasoning: runner.ts has zero
 * imports (a fully self-contained module — every effect is injected via
 * FlightRunnerDeps) and is exercised with concrete expected-output
 * assertions by runner.test.ts. Scoping to just that one test file sidesteps
 * the root config's jsdom env-matching and the rest of the dashboard suite
 * entirely, keeping every mutant's rerun fast.
 */
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  root: repoRoot,
  test: {
    globals: false,
    environment: 'node',
    include: ['apps/dashboard/test/flight/runner.test.ts'],
  },
});
