// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * `scripts/ci/dependency-audit.mjs`-only Vitest config, used exclusively by
 * Stryker (stryker.ci-dependency-audit.config.mjs) — NOT wired into
 * `pnpm run test`, which keeps using the root config's full-workspace run.
 *
 * Mirrors vitest.ci-run-repo-census-tests.config.ts's reasoning:
 * `findTransientAuditMarker`, `isTransientAuditFailure` and
 * `runAuditWithRetry` are pure (audit output in, a classification or an exit
 * code out — `runOnce`, `sleep` and the three log sinks are injected), import
 * nothing beyond Node built-ins, and are exercised with exact expected-output
 * fixtures by dependency-audit.test.ts. Scoping to just that one test file
 * sidesteps the root config's test-tree discovery (every apps/ and packages/
 * package's test dir) and the rest of the monorepo suite entirely, keeping
 * every mutant's rerun fast.
 */
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  root: repoRoot,
  test: {
    globals: false,
    environment: 'node',
    include: ['apps/dashboard/test/tooling/dependency-audit.test.ts'],
  },
});
