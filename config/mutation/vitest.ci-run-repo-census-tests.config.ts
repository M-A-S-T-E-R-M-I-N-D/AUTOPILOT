// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * `scripts/ci/run-repo-census-tests.mjs`-only Vitest config, used exclusively
 * by Stryker (stryker.ci-run-repo-census-tests.config.mjs) — NOT wired into
 * `pnpm run test`, which keeps using the root config's full-workspace run.
 *
 * Mirrors vitest.ci-check-doc-commit-refs.config.ts's reasoning: `isRepoReadingTest`
 * and `censusTestFiles` are pure filesystem discovery (a root directory in,
 * a sorted, deduped file list out), import nothing beyond Node built-ins, and
 * are exercised with exact expected-output fixtures by
 * run-repo-census-tests.test.ts. Scoping to just that one test file sidesteps
 * the root config's test-tree discovery (every apps/ and packages/ package's
 * test dir) and the rest of the monorepo suite entirely, keeping every
 * mutant's rerun fast.
 */
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  root: repoRoot,
  test: {
    globals: false,
    environment: 'node',
    include: ['apps/dashboard/test/tooling/run-repo-census-tests.test.ts'],
  },
});
