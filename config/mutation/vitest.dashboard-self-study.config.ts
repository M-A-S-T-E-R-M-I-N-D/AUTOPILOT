// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * `apps/dashboard/src/flight/self-study.ts`-only Vitest config, used
 * exclusively by Stryker (stryker.dashboard-self-study.config.mjs) — NOT
 * wired into `pnpm run test`, which keeps using the root config's
 * full-workspace run.
 *
 * Mirrors vitest.dashboard-verify-by.config.ts's reasoning: self-study.ts has
 * zero imports (a fully self-contained pure module — see its own file
 * header) and is exercised with concrete expected-output assertions by
 * self-study.test.ts, covering the firings-gate on `selfStudyInvocation` and
 * the dirty-check branch of `commitSelfStudyIfDirty`. Scoping to just that
 * one test file sidesteps the root config's jsdom env-matching and the rest
 * of the dashboard suite entirely, keeping every mutant's rerun fast.
 */
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  root: repoRoot,
  test: {
    globals: false,
    environment: 'node',
    include: ['apps/dashboard/test/flight/self-study.test.ts'],
  },
});
