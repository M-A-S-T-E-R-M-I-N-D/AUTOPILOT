// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * `apps/dashboard/src/control/watchdog.ts`-only Vitest config, used
 * exclusively by Stryker (stryker.dashboard-watchdog.config.mjs) — NOT
 * wired into `pnpm run test`, which keeps using the root config's
 * full-workspace run.
 *
 * Mirrors vitest.dashboard-state.config.ts's reasoning: scoped to just
 * watchdog.test.ts, whose only non-node imports are control.ts/state.ts/
 * types.ts (no `@autopilot/store`, no native binding) — its one reach into
 * a workspace package, through control.ts, is aliased below.
 */
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  root: repoRoot,
  resolve: {
    alias: {
      // watchdog.test.ts drives the real DashboardControl, and control.ts
      // imports ../flight/spawn-flight.ts, which since 1628745e (epic 0036)
      // imports ./firing-engine.ts, which imports @autopilot/engine for
      // `isLocallyServed` and `resolveModelVendor` (both in
      // packages/engine/src/model-vendor.ts, no imports of its own). Inside the
      // Stryker sandbox (symlinkNodeModules: false) the package name cannot
      // resolve — "Cannot find package '@autopilot/engine'" — so `vitest
      // related` found no tests and the 2026-10-03 nightly went red with zero
      // mutants run. Aliased straight to that source file, as
      // vitest.dashboard-spawn-flight.config.ts does.
      '@autopilot/engine': fileURLToPath(
        new URL('../../packages/engine/src/model-vendor.ts', import.meta.url),
      ),
    },
  },
  test: {
    globals: false,
    environment: 'node',
    include: ['apps/dashboard/test/control/watchdog.test.ts'],
  },
});
