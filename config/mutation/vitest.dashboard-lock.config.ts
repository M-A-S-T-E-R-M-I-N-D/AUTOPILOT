// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * `apps/dashboard/src/flight/lock.ts`-only Vitest config, used exclusively
 * by Stryker (stryker.dashboard-lock.config.mjs) — NOT wired into
 * `pnpm run test`, which keeps using the root config's full-workspace run.
 *
 * Mirrors vitest.dashboard-worktree.config.ts's reasoning: scoped to just
 * lock.test.ts, the only test file exercising engineLockFileName /
 * flightLogFileName / deriveFlyProjectId.
 *
 * The alias below mirrors vitest.engine-loop.config.ts's: lock.ts's static
 * import of `@autopilot/onboarding` (for `slugify`) is a bare workspace
 * specifier that `symlinkNodeModules: false` (required elsewhere for the
 * better-sqlite3 native-binding issue, see stryker.store.config.mjs) never
 * recreates inside Stryker's sandboxed copy, so `vitest --related` silently
 * finds no related tests. Aliasing straight to the leaf source module that
 * actually DEFINES `slugify` (only a type-only import of its own, erased at
 * compile time — same "good target" shape as every other module here)
 * sidesteps the missing symlink entirely.
 */
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  root: repoRoot,
  resolve: {
    alias: {
      '@autopilot/onboarding': fileURLToPath(
        new URL('../../packages/onboarding/src/onboard/soul.ts', import.meta.url),
      ),
    },
  },
  test: {
    globals: false,
    environment: 'node',
    include: ['apps/dashboard/test/flight/lock.test.ts'],
  },
});
