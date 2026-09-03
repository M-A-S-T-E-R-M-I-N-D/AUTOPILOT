// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * `packages/engine/src/loop.ts`-only Vitest config, used exclusively by
 * Stryker (stryker.engine-loop.config.mjs) — NOT wired into `pnpm run
 * test`, which keeps using the root config's full-workspace run.
 *
 * Mirrors vitest.engine-info.config.ts's reasoning: pointing Stryker's dry
 * run at the root config (or even all of packages/engine/test/) pulls in
 * adapters/git.test.ts's real `git` subprocess tests into the sandboxed copy
 * of the tree. loop.ts imports real functions from firing.ts and
 * resilience.ts (both already isolated, subprocess-free modules of their
 * own), but loop.test.ts always supplies a fake `runFiring` through the
 * `LoopDeps.runFiring` test seam, so the real firing runner is never
 * invoked — only its import is loaded, never called. Scoping to just
 * loop.test.ts sidesteps the slow/crash-prone tests entirely and keeps
 * every mutant's rerun fast.
 *
 * The alias below mirrors vitest.engine-firing.config.ts's: loop.ts's
 * static import of firing.ts pulls in firing.ts's own runtime import of
 * telemetry.ts, which imports SEVERITIES/DIMENSIONS from the
 * `@autopilot/store` WORKSPACE package. That package's root re-exports
 * db.js (better-sqlite3's native binding), and pnpm links it only inside
 * `packages/engine/node_modules/@autopilot/store` — a nested symlink
 * `symlinkNodeModules: false` (required to dodge a native-binding crash
 * under a Windows-sandboxed symlink, see stryker.store.config.mjs) never
 * recreates, so the sandboxed copy can't resolve the bare specifier at all
 * and Stryker's `vitest --related` dry run silently finds no related tests.
 * Aliasing straight to the leaf source module that actually DEFINES those
 * two constants (zero imports of its own — no db.js, no native binding,
 * same "good target" shape as every other module here) sidesteps both
 * problems: the missing symlink and the native-binding risk re-enabling
 * `symlinkNodeModules` would reintroduce.
 */
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  root: repoRoot,
  resolve: {
    alias: {
      '@autopilot/store': fileURLToPath(
        new URL('../../packages/store/src/types.ts', import.meta.url),
      ),
    },
  },
  test: {
    globals: false,
    environment: 'node',
    include: ['packages/engine/test/loop.test.ts'],
  },
});
