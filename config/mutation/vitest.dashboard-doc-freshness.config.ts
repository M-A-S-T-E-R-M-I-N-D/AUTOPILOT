// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * `apps/dashboard/src/flight/doc-freshness.ts`-only Vitest config, used
 * exclusively by Stryker (stryker.dashboard-doc-freshness.config.mjs) — NOT
 * wired into `pnpm run test`, which keeps using the root config's
 * full-workspace run.
 *
 * Mirrors vitest.dashboard-worktree.config.ts's reasoning: scoped to just
 * doc-freshness.test.ts, sidestepping the root config's jsdom env-matching
 * and the rest of the dashboard suite for a fast per-mutant rerun.
 */
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  root: repoRoot,
  test: {
    globals: false,
    environment: 'node',
    include: ['apps/dashboard/test/flight/doc-freshness.test.ts'],
  },
});
