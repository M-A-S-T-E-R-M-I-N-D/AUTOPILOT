// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * `scripts/ci/audit-board-flood.mjs`-only Vitest config, used exclusively by
 * Stryker (stryker.ci-audit-board-flood.config.mjs) — NOT wired into `pnpm
 * run test`, which keeps using the root config's full-workspace run.
 *
 * Mirrors vitest.ci-check-merge-integrity.config.ts's reasoning: scoping to
 * just audit-board-flood.test.ts sidesteps the root config's test-tree
 * discovery (every apps/ and packages/ package's test dir) and the rest of
 * the monorepo suite entirely, keeping every mutant's rerun fast.
 */
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  root: repoRoot,
  test: {
    globals: false,
    environment: 'node',
    include: ['apps/dashboard/test/tooling/audit-board-flood.test.ts'],
  },
});
