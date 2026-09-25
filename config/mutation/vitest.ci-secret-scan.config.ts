// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * `scripts/ci/secret-scan.mjs`-only Vitest config, used exclusively by
 * Stryker (stryker.ci-secret-scan.config.mjs) — NOT wired into `pnpm run
 * test`, which keeps using the root config's full-workspace run.
 *
 * Mirrors vitest.ci-license-check.config.ts's reasoning: `findSecrets` and
 * its `redact` helper have zero imports beyond Node built-ins and are
 * exercised with concrete expected-output assertions by secret-scan.test.ts.
 * Scoping to just that one test file sidesteps the root config's test-tree
 * discovery (every apps/ and packages/ package's test dir) and the rest of
 * the monorepo suite entirely, keeping every mutant's rerun fast.
 *
 * secret-scan-history.test.ts also reaches `findSecrets` (through
 * scanPatch), but only as a dependency — it asserts the patch parser, so it
 * would add reruns without adding kills, and it belongs to that script's own
 * future config.
 */
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  root: repoRoot,
  test: {
    globals: false,
    environment: 'node',
    include: ['apps/dashboard/test/tooling/secret-scan.test.ts'],
  },
});
