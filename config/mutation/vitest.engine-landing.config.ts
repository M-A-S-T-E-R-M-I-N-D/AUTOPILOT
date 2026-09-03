// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * `packages/engine/src/landing.ts`-only Vitest config, used exclusively by
 * Stryker (stryker.engine-landing.config.mjs) — NOT wired into `pnpm run
 * test`, which keeps using the root config's full-workspace run.
 *
 * Mirrors vitest.engine-resilience.config.ts's reasoning: pointing Stryker's
 * dry run at the root config (or even all of packages/engine/test/) pulls in
 * adapters/git.test.ts's real `git` subprocess tests into the sandboxed copy
 * of the tree. landing.ts imports adapters/git.js only as a TYPE (`LandResult`,
 * erased at compile time) — no runtime dependency on the real git adapter —
 * and landing.test.ts drives it entirely through fake `GatePort`/`Landable`
 * objects, never a real filesystem read or subprocess, so scoping to just
 * that one file sidesteps the slow/crash-prone tests entirely and keeps
 * every mutant's rerun fast.
 */
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  root: repoRoot,
  test: {
    globals: false,
    environment: 'node',
    include: ['packages/engine/test/landing.test.ts'],
  },
});
