// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * `apps/dashboard/src/flight/preflight.ts`-only Vitest config, used
 * exclusively by Stryker (stryker.dashboard-preflight.config.mjs) — NOT wired
 * into `pnpm run test`, which keeps using the root config's full-workspace
 * run. One pure module, one test file, fast mutant reruns.
 */
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  root: repoRoot,
  resolve: {
    alias: {
      // preflight.ts reaches one workspace package, through ./firing-engine.ts:
      // `isLocallyServed` and `resolveModelVendor`, both in
      // packages/engine/src/model-vendor.ts (no imports of its own). Inside
      // the Stryker sandbox (symlinkNodeModules: false) the package name
      // cannot resolve — "Cannot find package '@autopilot/engine'" — so
      // `vitest related` found no tests and the 2026-10-03 nightly went red
      // with zero mutants run. Aliased straight to that source file, the
      // same move the convergence-gate config makes for its store import.
      '@autopilot/engine': fileURLToPath(
        new URL('../../packages/engine/src/model-vendor.ts', import.meta.url),
      ),
    },
  },
  test: {
    globals: false,
    environment: 'node',
    include: ['apps/dashboard/test/flight/preflight.test.ts'],
  },
});
