// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * Store-only Vitest config, used exclusively by Stryker
 * (stryker.store.config.mjs) — NOT wired into `pnpm run test`, which keeps
 * using the root config's full-workspace run.
 *
 * Running mutation testing's dry-run coverage pass against the root config
 * pulls in the WHOLE monorepo suite (1353 tests, including packages/engine's
 * real `git` subprocess tests and packages/onboarding's e2e repo-cloning
 * tests) inside Stryker's sandboxed copy of the tree — that crashed the
 * vitest worker outright (native-module/subprocess state doesn't survive
 * being duplicated into `.stryker-tmp-store/sandbox-*`). Store has zero
 * cross-package imports (see packages/store/package.json), so scoping to
 * just its own tests sidesteps the crash entirely and keeps every mutant's
 * rerun fast.
 */
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  root: repoRoot,
  test: {
    globals: false,
    environment: 'node',
    include: ['packages/store/test/**/*.test.ts'],
  },
});
