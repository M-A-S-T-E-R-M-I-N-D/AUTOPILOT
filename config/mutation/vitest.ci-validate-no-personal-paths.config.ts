// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * `scripts/ci/validate-no-personal-paths.mjs`-only Vitest config, used
 * exclusively by Stryker (stryker.ci-validate-no-personal-paths.config.mjs) —
 * NOT wired into `pnpm run test`, which keeps using the root config's
 * full-workspace run.
 *
 * Mirrors vitest.ci-secret-scan.config.ts's reasoning: `findPersonalPaths` is
 * pure (a file's text in, an array of findings out), imports nothing beyond
 * Node built-ins, and is exercised with exact expected-output fixtures — plus
 * a 45-shape negative corpus — by validate-no-personal-paths.test.ts. Scoping
 * to just that one test file sidesteps the root config's test-tree discovery
 * (every apps/ and packages/ package's test dir) and the rest of the monorepo
 * suite entirely, keeping every mutant's rerun fast.
 */
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  root: repoRoot,
  test: {
    globals: false,
    environment: 'node',
    include: ['apps/dashboard/test/tooling/validate-no-personal-paths.test.ts'],
  },
});
