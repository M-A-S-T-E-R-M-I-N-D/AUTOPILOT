// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * `apps/dashboard/src/connection/verify.ts`-only Vitest config, used
 * exclusively by Stryker (stryker.dashboard-verify.config.mjs) — NOT wired
 * into `pnpm run test`, which keeps using the root config's full-workspace
 * run.
 *
 * Mirrors vitest.dashboard-ritual-lock.config.ts's reasoning: verify.ts's
 * only workspace import is a bare specifier (`@autopilot/engine`, for
 * `parseModelEnvelope`) that `symlinkNodeModules: false` never recreates
 * inside Stryker's sandboxed copy, so `vitest --related` silently finds no
 * related tests. Aliasing straight to the leaf source module that actually
 * DEFINES `parseModelEnvelope` (claude-cli.ts) sidesteps the missing symlink
 * entirely — its own imports are all relative (`../ports.js`, `../config.js`,
 * `../auth.js`, `../stream.js`), which resolve as plain files inside the
 * sandbox copy without needing node_modules at all.
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
        new URL('../../packages/engine/src/adapters/claude-cli.ts', import.meta.url),
      ),
    },
  },
  test: {
    globals: false,
    environment: 'node',
    include: ['apps/dashboard/test/connection/verify.test.ts'],
  },
});
