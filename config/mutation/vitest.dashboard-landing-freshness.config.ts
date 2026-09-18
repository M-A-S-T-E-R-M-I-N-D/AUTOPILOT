// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * `apps/dashboard/src/landing/freshness.ts`-only Vitest config, used exclusively by
 * Stryker (stryker.dashboard-landing-freshness.config.mjs) — NOT wired into `pnpm run test`,
 * which keeps using the root config's full-workspace run. One test file,
 * node environment: every mutant's rerun stays a fraction of a second.
 */
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  root: repoRoot,
  test: {
    globals: false,
    environment: 'node',
    include: ['apps/dashboard/test/landing/freshness.test.ts'],
  },
});
