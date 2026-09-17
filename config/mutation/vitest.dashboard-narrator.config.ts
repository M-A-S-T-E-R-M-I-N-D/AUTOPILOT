// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * `apps/dashboard/src/shared/narrator.ts`-only Vitest config, used
 * exclusively by Stryker (stryker.dashboard-narrator.config.mjs) — NOT wired
 * into `pnpm run test`, which keeps using the root config's full-workspace
 * run.
 *
 * Mirrors vitest.dashboard-turns.config.ts's reasoning: narrator.ts has zero
 * imports (a fully self-contained pure module — see its own file header) and
 * is exercised with concrete expected-output assertions by fleet.test.ts's
 * `describe('narratorLine', ...)` block. Scoping to just that one test file
 * sidesteps the root config's jsdom env-matching and the rest of the
 * dashboard suite entirely, keeping every mutant's rerun fast.
 */
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  root: repoRoot,
  test: {
    globals: false,
    environment: 'node',
    // shared/narrator.test.ts added 2026-09-17 — the module's OWN test file,
    // 17 tests over narratorTarget/narratorKind/basename, which this include
    // omitted while listing only read/fleet.test.ts (a caller). Stryker was
    // therefore scoring narrator.ts against a suite that exercises it
    // incidentally rather than the one written for it. The same instrument
    // error as vitest.tokens-color.config.ts's: the mutants still have to die,
    // but the runner has to be pointed at the tests that can kill them.
    include: [
      'apps/dashboard/test/shared/narrator.test.ts',
      'apps/dashboard/test/read/fleet.test.ts',
    ],
  },
});
