// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * `packages/tokens/src/css.ts`-only Vitest config, used exclusively by
 * Stryker (stryker.tokens-css.config.mjs) — NOT wired into `pnpm run test`,
 * which keeps using the root config's full-workspace run.
 *
 * Mirrors vitest.tokens-color.config.ts's reasoning: css.ts's only imports
 * are sibling pure token modules (no native bindings) and is exercised with
 * concrete expected-output assertions by css.test.ts. Scoping to just that
 * one test file sidesteps the root config's jsdom env-matching and the rest
 * of the monorepo suite entirely, keeping every mutant's rerun fast.
 */
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  root: repoRoot,
  test: {
    globals: false,
    environment: 'node',
    include: ['packages/tokens/test/css.test.ts'],
  },
});
