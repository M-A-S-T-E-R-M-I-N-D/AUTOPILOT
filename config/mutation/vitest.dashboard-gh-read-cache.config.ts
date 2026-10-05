// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * `apps/dashboard/src/connection/gh-read-cache.ts`-only Vitest config, used
 * exclusively by Stryker (stryker.dashboard-gh-read-cache.config.mjs). Scoped
 * to its one test file so every mutant rerun stays fast.
 */
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  root: repoRoot,
  test: {
    globals: false,
    environment: 'node',
    include: ['apps/dashboard/test/connection/gh-read-cache.test.ts'],
  },
});
