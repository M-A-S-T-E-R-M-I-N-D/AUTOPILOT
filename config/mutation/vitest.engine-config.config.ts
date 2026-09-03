// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * `packages/engine/src/config.ts`-only Vitest config, used exclusively by
 * Stryker (stryker.engine-config.config.mjs) — NOT wired into `pnpm run
 * test`, which keeps using the root config's full-workspace run.
 *
 * Mirrors vitest.engine-landing.config.ts's reasoning: pointing Stryker's
 * dry run at the root config (or even all of packages/engine/test/) pulls in
 * adapters/git.test.ts's real `git` subprocess tests into the sandboxed copy
 * of the tree. config.ts imports `ResilienceConfig` from `./resilience.js`
 * only as a TYPE (erased at compile time) — it has no runtime imports at
 * all — and config.test.ts drives it entirely through its own exported
 * constants, never a real filesystem read or subprocess, so scoping to just
 * that one file sidesteps the slow/crash-prone tests entirely and keeps
 * every mutant's rerun fast.
 */
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  root: repoRoot,
  test: {
    globals: false,
    environment: 'node',
    include: ['packages/engine/test/config.test.ts'],
  },
});
