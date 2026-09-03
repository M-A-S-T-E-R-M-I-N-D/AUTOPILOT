// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * `apps/dashboard/src/flight/deliverable-predicates.ts`-only Vitest config,
 * used exclusively by Stryker
 * (stryker.dashboard-deliverable-predicates.config.mjs) — NOT wired into
 * `pnpm run test`, which keeps using the root config's full-workspace run.
 *
 * Mirrors vitest.dashboard-deliverable.config.ts's reasoning: the module is
 * pure logic behind an injected PredicateVcs port and is exercised with
 * concrete expected-output assertions (every comparator alternative, every
 * bare-name extension, every resolution failure) by
 * deliverable-predicates.test.ts. Scoping to that one test file keeps every
 * mutant's rerun fast.
 */
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  root: repoRoot,
  test: {
    globals: false,
    environment: 'node',
    include: ['apps/dashboard/test/flight/deliverable-predicates.test.ts'],
  },
});
