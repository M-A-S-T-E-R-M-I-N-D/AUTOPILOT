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
    // config-windows-acl.test.ts added 2026-09-17. config.test.ts asserts the
    // icacls ACL only under `if (process.platform === 'win32')`, by reading a
    // real file — and mutation testing runs on ubuntu, where that branch never
    // executes. Stryker therefore reported all of restrictToOwnerWindows as
    // NoCoverage: 20 mutants inside a security control with nothing in CI able
    // to kill one. The added file tests the same function with the platform and
    // the subprocess mocked, so it runs everywhere.
    include: [
      'apps/dashboard/test/connection/config.test.ts',
      'apps/dashboard/test/connection/config-windows-acl.test.ts',
    ],
  },
});
