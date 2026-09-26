// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * `scripts/ci/check-model-freshness.mjs`-only Vitest config, used exclusively
 * by Stryker (stryker.ci-check-model-freshness.config.mjs) — NOT wired into
 * `pnpm run test`, which keeps using the root config's full-workspace run.
 *
 * Mirrors vitest.ci-dependency-audit.config.ts's reasoning: `catalogueIds`,
 * `catalogueFamilies`, `cataloguePinnedIds`, `resolveAliasFromUsage`,
 * `findStalePins`, `extractAdvertisedAliases` and `findUnknownFamilyAliases`
 * are pure (catalogue source, CLI help text or a probe reply in, a list or a
 * finding out), import nothing beyond Node built-ins, and are exercised with
 * exact expected-output fixtures by check-model-freshness.test.ts. Scoping to
 * just that one test file sidesteps the root config's test-tree discovery
 * (every apps/ and packages/ package's test dir) and the rest of the monorepo
 * suite entirely, keeping every mutant's rerun fast.
 */
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  root: repoRoot,
  test: {
    globals: false,
    environment: 'node',
    include: ['apps/dashboard/test/tooling/check-model-freshness.test.ts'],
  },
});
