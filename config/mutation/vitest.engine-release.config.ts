// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * `packages/engine/src/release.ts`-only Vitest config, used exclusively by
 * Stryker (stryker.engine-release.config.mjs) — NOT wired into `pnpm run
 * test`, which keeps using the root config's full-workspace run.
 *
 * Mirrors vitest.store.config.ts's reasoning: pointing Stryker's dry run at
 * the root config (or even all of packages/engine/test/) pulls in
 * adapters/git.test.ts's real `git` subprocess tests (~300-700ms each,
 * documented in stryker.store.config.mjs as "minutes-to-hours" under
 * mutation) into the sandboxed copy of the tree. release.ts has zero
 * imports (a fully self-contained pure module — see its own file header)
 * and release.test.ts imports nothing but vitest and release.js, so scoping
 * to just that one file sidesteps the slow/crash-prone tests entirely and
 * keeps every mutant's rerun fast.
 */
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  root: repoRoot,
  test: {
    globals: false,
    environment: 'node',
    include: ['packages/engine/test/release.test.ts'],
  },
});
