// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * `packages/tokens/src/color.ts`-only Vitest config, used exclusively by
 * Stryker (stryker.tokens-color.config.mjs) — NOT wired into `pnpm run test`,
 * which keeps using the root config's full-workspace run.
 *
 * Mirrors vitest.dashboard-registry.config.ts's reasoning: color.ts has zero
 * imports (pure OKLCH math, see the file's header) and is exercised with
 * concrete expected-output assertions by color.test.ts. Scoping to a narrow
 * test set sidesteps the root config's jsdom env-matching and the rest of the
 * monorepo suite entirely, keeping every mutant's rerun fast.
 *
 * `contrast-matrix.test.ts` belongs in that set and was missing (2026-09-17).
 * color.ts exports FOUR things a test can reach — parseOklch,
 * relativeLuminance, contrastRatio and contrastMatrix — and color.test.ts
 * covers the first three. contrastMatrix (and the classifyContrast it calls)
 * are exercised, thoroughly, by contrast-matrix.test.ts, which this include
 * did not list. So Stryker ran those two functions' mutants against a suite
 * that never calls them and reported all 26 as NoCoverage: the config scored
 * 75.00% while the tests that would have killed them sat in the next file
 * over, passing.
 *
 * That is worth stating plainly because it is NOT the same as relaxing a bar.
 * Nothing here lowers a threshold or excuses a mutant — every one of those 26
 * still has to die, and now the runner is at least pointed at the tests that
 * can kill it. A per-module mutation config is an instrument, and an
 * instrument aimed at the wrong test file reports a defect in the instrument,
 * not in the code.
 */
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  root: repoRoot,
  test: {
    globals: false,
    environment: 'node',
    include: ['packages/tokens/test/color.test.ts', 'packages/tokens/test/contrast-matrix.test.ts'],
  },
});
