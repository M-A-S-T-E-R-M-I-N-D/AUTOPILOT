// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * `apps/dashboard/src/flight/ritual-lock.ts`-only Vitest config, used
 * exclusively by Stryker (stryker.dashboard-ritual-lock.config.mjs) — NOT
 * wired into `pnpm run test`, which keeps using the root config's
 * full-workspace run.
 *
 * Mirrors vitest.dashboard-service.config.ts's reasoning: ritual-lock.ts's
 * only non-node import is a bare workspace specifier (`@autopilot/engine`)
 * that `symlinkNodeModules: false` never recreates inside Stryker's sandboxed
 * copy, so `vitest --related` silently finds no related tests. The symbols it
 * and its test take from there live in two leaf modules (`FileInstanceLock`
 * in adapters/instance-lock.ts; the sync-back mutex and primary-flight marker
 * in adapters/worktree.ts, whose own imports are node builtins and relative
 * files), so a single-file alias can't satisfy them all — aliasing to
 * shim.dashboard-ritual-lock-engine.ts, which re-exports each from its real
 * source, sidesteps the missing symlink entirely.
 *
 * `root` is pinned back to the repo root explicitly: Vitest defaults `root`
 * to this config file's own directory (config/mutation/), which would
 * otherwise resolve `include` against the wrong tree.
 */
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  root: repoRoot,
  resolve: {
    alias: {
      '@autopilot/engine': fileURLToPath(
        new URL('./shim.dashboard-ritual-lock-engine.ts', import.meta.url),
      ),
    },
  },
  test: {
    globals: false,
    environment: 'node',
    include: ['apps/dashboard/test/flight/ritual-lock.test.ts'],
  },
});
