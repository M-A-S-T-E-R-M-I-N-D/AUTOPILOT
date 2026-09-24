// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * `scripts/ci/check-conflict-markers.mjs`-only Vitest config, used
 * exclusively by Stryker (stryker.ci-check-conflict-markers.config.mjs) —
 * NOT wired into `pnpm run test`, which keeps using the root config's
 * full-workspace run.
 *
 * Mirrors vitest.ci-validate-spdx-headers.config.ts's reasoning:
 * findConflictMarkers has zero imports beyond Node built-ins and is
 * exercised with concrete expected-output assertions by
 * check-conflict-markers.test.ts. Scoping to just that one test file
 * sidesteps the root config's test-tree discovery (every apps/ and
 * packages/ package's test dir) and the rest of the monorepo suite
 * entirely, keeping every mutant's rerun fast.
 */
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  root: repoRoot,
  test: {
    globals: false,
    environment: 'node',
    include: ['apps/dashboard/test/tooling/check-conflict-markers.test.ts'],
  },
});
