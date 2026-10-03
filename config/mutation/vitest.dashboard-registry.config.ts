// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * `apps/dashboard/src/flight/registry.ts`-only Vitest config, used
 * exclusively by Stryker (stryker.dashboard-registry.config.mjs) — NOT
 * wired into `pnpm run test`, which keeps using the root config's
 * full-workspace run.
 *
 * Mirrors vitest.dashboard-runner.config.ts's reasoning: registry.ts's only
 * import is the sibling FlightRunner class (every actual effect still
 * arrives via FlightRunnerDeps) and is exercised with concrete
 * expected-output assertions by registry.test.ts. Scoping to just that one
 * test file sidesteps the root config's jsdom env-matching and the rest of
 * the dashboard suite entirely, keeping every mutant's rerun fast.
 */
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  root: repoRoot,
  resolve: {
    alias: {
      // registry.ts reaches one workspace package, through ./runner.ts and
      // ./firing-engine.ts (47c7649b, epic 0036): `isLocallyServed` and
      // `resolveModelVendor`, both in packages/engine/src/model-vendor.ts (no
      // imports of its own). Inside the Stryker sandbox (symlinkNodeModules:
      // false) the package name cannot resolve — "Cannot find package
      // '@autopilot/engine'" — so `vitest related` found no tests and the
      // 2026-10-03 nightly went red with zero mutants run. Aliased straight to
      // that source file, as vitest.dashboard-preflight.config.ts does.
      '@autopilot/engine': fileURLToPath(
        new URL('../../packages/engine/src/model-vendor.ts', import.meta.url),
      ),
    },
  },
  test: {
    globals: false,
    environment: 'node',
    include: ['apps/dashboard/test/flight/registry.test.ts'],
  },
});
