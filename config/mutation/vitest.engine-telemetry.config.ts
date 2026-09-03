// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * `packages/engine/src/telemetry.ts`-only Vitest config, used exclusively by
 * Stryker (stryker.engine-telemetry.config.mjs) — NOT wired into `pnpm run
 * test`, which keeps using the root config's full-workspace run.
 *
 * Mirrors vitest.engine-firing.config.ts's reasoning: pointing Stryker's dry
 * run at the root config (or even all of packages/engine/test/) pulls in
 * adapters/git.test.ts's real `git` subprocess tests into the sandboxed copy
 * of the tree. telemetry.ts's only non-type runtime import is
 * `@autopilot/store` (for SEVERITIES/DIMENSIONS) — the `StartedOn` import
 * from resilience.js is `import type`, erased at compile time — and
 * telemetry.test.ts drives it entirely through plain object literals, never
 * a real filesystem read or subprocess, so scoping to just that one file
 * sidesteps the slow/crash-prone tests entirely and keeps every mutant's
 * rerun fast.
 *
 * The alias below is the same fix vitest.engine-firing.config.ts needed for
 * this exact import: `@autopilot/store`'s root re-exports db.js
 * (better-sqlite3's native binding), and pnpm links the package only inside
 * `packages/engine/node_modules/@autopilot/store` — a nested symlink
 * `symlinkNodeModules: false` (required elsewhere to dodge a native-binding
 * crash under a Windows-sandboxed symlink, see stryker.store.config.mjs)
 * never recreates, so the sandboxed copy can't resolve the bare specifier at
 * all. Aliasing straight to the leaf source module that actually DEFINES
 * those two constants (zero imports of its own — no db.js, no native
 * binding) sidesteps both problems: the missing symlink and the
 * native-binding risk re-enabling `symlinkNodeModules` would reintroduce.
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
    include: ['packages/engine/test/telemetry.test.ts'],
  },
});
