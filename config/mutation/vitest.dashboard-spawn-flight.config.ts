// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * `apps/dashboard/src/flight/spawn-flight.ts`-only Vitest config, used
 * exclusively by Stryker (stryker.dashboard-spawn-flight.config.mjs) — NOT
 * wired into `pnpm run test`, which keeps using the root config's
 * full-workspace run.
 *
 * Mirrors vitest.dashboard-worktree.config.ts's reasoning: scoped to just
 * spawn-flight.test.ts, which mocks `node:child_process` entirely — no
 * native binding, nothing else to drag into the sandbox.
 */
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  root: repoRoot,
  resolve: {
    alias: {
      // spawn-flight.ts reaches one workspace package, through
      // ./firing-engine.ts (epic 0036): `isLocallyServed` and
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
    include: ['apps/dashboard/test/flight/spawn-flight.test.ts'],
  },
});
