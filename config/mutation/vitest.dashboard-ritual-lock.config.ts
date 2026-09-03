// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * `apps/dashboard/src/flight/ritual-lock.ts`-only Vitest config, used
 * exclusively by Stryker (stryker.dashboard-ritual-lock.config.mjs) — NOT
 * wired into `pnpm run test`, which keeps using the root config's
 * full-workspace run.
 *
 * Mirrors vitest.dashboard-lock.config.ts's reasoning: ritual-lock.ts's only
 * import is a bare workspace specifier (`@autopilot/engine`, for
 * `FileInstanceLock`) that `symlinkNodeModules: false` never recreates
 * inside Stryker's sandboxed copy, so `vitest --related` silently finds no
 * related tests. Aliasing straight to the leaf source module that actually
 * DEFINES `FileInstanceLock` (only `node:fs` imports of its own, erased at
 * compile time — same "good target" shape as every other module here)
 * sidesteps the missing symlink entirely.
 *
 * `root` is pinned back to the repo root explicitly: Vitest defaults `root`
 * to this config file's own directory (config/mutation/), which would
 * otherwise resolve `include` against the wrong tree.
 */
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  root: repoRoot,
  resolve: {
    alias: {
      '@autopilot/engine': fileURLToPath(
        new URL('../../packages/engine/src/adapters/instance-lock.ts', import.meta.url),
      ),
    },
  },
  test: {
    globals: false,
    environment: 'node',
    include: ['apps/dashboard/test/flight/ritual-lock.test.ts'],
  },
});
