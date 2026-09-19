// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * `apps/dashboard/src/flight/convergence-gate.ts`-only Vitest config, used
 * exclusively by Stryker (stryker.dashboard-convergence-gate.config.mjs) —
 * NOT wired into `pnpm run test`, which keeps using the root config's
 * full-workspace run. One pure module, one test file, fast mutant reruns.
 */
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  root: repoRoot,
  resolve: {
    alias: {
      // The module's one runtime import from a workspace package is `median`
      // (packages/store/src/stats.ts, no native driver behind it). Inside the
      // Stryker sandbox (symlinkNodeModules: false) the package name cannot
      // resolve at all — "Cannot find package '@autopilot/store'" — so it is
      // aliased straight to that source file, the same move the ask config
      // makes for its workspace imports.
      '@autopilot/store': fileURLToPath(
        new URL('../../packages/store/src/stats.ts', import.meta.url),
      ),
    },
  },
  test: {
    globals: false,
    environment: 'node',
    include: ['apps/dashboard/test/flight/convergence-gate.test.ts'],
  },
});
