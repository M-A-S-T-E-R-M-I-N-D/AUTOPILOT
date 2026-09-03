// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * `apps/dashboard/src/connection/login.ts`-only Vitest config, used
 * exclusively by Stryker (stryker.dashboard-login.config.mjs) — NOT wired
 * into `pnpm run test`, which keeps using the root config's full-workspace
 * run.
 *
 * login.ts has zero workspace imports (only `node:child_process`), same
 * low-risk shape as cli-probe.ts — no alias needed to work around Stryker's
 * `symlinkNodeModules: false` sandbox.
 */
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  root: repoRoot,
  test: {
    globals: false,
    environment: 'node',
    include: ['apps/dashboard/test/connection/login.test.ts'],
  },
});
