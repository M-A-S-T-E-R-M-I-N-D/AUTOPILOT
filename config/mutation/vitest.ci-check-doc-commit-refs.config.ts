// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * `scripts/ci/check-doc-commit-refs.mjs`-only Vitest config, used exclusively
 * by Stryker (stryker.ci-check-doc-commit-refs.config.mjs) — NOT wired into
 * `pnpm run test`, which keeps using the root config's full-workspace run.
 *
 * Mirrors vitest.ci-secret-scan.config.ts's reasoning: `findShaCitations` is
 * pure (a file's text in, an array of citations out), imports nothing beyond
 * Node built-ins, and is exercised with exact expected-output fixtures by
 * check-doc-commit-refs.test.ts. Scoping to just that one test file sidesteps
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
    include: ['apps/dashboard/test/tooling/check-doc-commit-refs.test.ts'],
  },
});
