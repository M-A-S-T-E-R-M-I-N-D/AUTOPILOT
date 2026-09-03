// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * `apps/dashboard/src/connection/config.ts`-only Vitest config, used
 * exclusively by Stryker (stryker.dashboard-connection-config.config.mjs) —
 * NOT wired into `pnpm run test`, which keeps using the root config's
 * full-workspace run.
 *
 * Mirrors vitest.dashboard-verify.config.ts's reasoning: config.ts's only
 * workspace import is a bare specifier (`@autopilot/engine`, for
 * `DEFAULT_AUTH`/`AuthConfig`/`AuthMode`) that `symlinkNodeModules: false`
 * never recreates inside Stryker's sandboxed copy, so `vitest --related`
 * silently finds no related tests. Aliasing straight to the leaf source
 * module that actually DEFINES `DEFAULT_AUTH` (auth.ts) sidesteps the
 * missing symlink entirely — auth.ts has zero imports of its own.
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
        new URL('../../packages/engine/src/auth.ts', import.meta.url),
      ),
    },
  },
  test: {
    globals: false,
    environment: 'node',
    include: ['apps/dashboard/test/connection/config.test.ts'],
  },
});
