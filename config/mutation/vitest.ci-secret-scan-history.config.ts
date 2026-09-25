// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * `scripts/ci/secret-scan-history.mjs`-only Vitest config, used exclusively
 * by Stryker (stryker.ci-secret-scan-history.config.mjs) — NOT wired into
 * `pnpm run test`, which keeps using the root config's full-workspace run.
 *
 * Mirrors vitest.ci-secret-scan.config.ts's reasoning: `parseAddedLines` and
 * `scanPatch` are pure (a patch string in, an array out), import nothing
 * beyond Node built-ins and their sibling secret-scan.mjs, and are exercised
 * with exact expected-output fixtures by secret-scan-history.test.ts. Scoping
 * to just that one test file sidesteps the root config's test-tree discovery
 * (every apps/ and packages/ package's test dir) and the rest of the monorepo
 * suite entirely, keeping every mutant's rerun fast.
 *
 * secret-scan.test.ts is deliberately NOT included: it exercises
 * `findSecrets`, which this config's `mutate` array never instruments, so it
 * would add reruns without adding kills — that function belongs to
 * stryker.ci-secret-scan.config.mjs.
 */
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  root: repoRoot,
  test: {
    globals: false,
    environment: 'node',
    include: ['apps/dashboard/test/tooling/secret-scan-history.test.ts'],
  },
});
