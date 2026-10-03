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
  test: {
    globals: false,
    environment: 'node',
    include: ['apps/dashboard/test/flight/preflight.test.ts'],
  },
});
