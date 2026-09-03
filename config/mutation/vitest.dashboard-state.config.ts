// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * `apps/dashboard/src/control/state.ts`-only Vitest config, used exclusively
 * by Stryker (stryker.dashboard-state.config.mjs) — NOT wired into
 * `pnpm run test`, which keeps using the root config's full-workspace run.
 *
 * Mirrors vitest.dashboard-spawn-flight.config.ts's reasoning: scoped to
 * just state.test.ts, which only imports `./types.js` (a type-only import,
 * erased at compile time) — no native binding, nothing else to drag into
 * the sandbox.
 */
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  root: repoRoot,
  test: {
    globals: false,
    environment: 'node',
    include: ['apps/dashboard/test/control/state.test.ts'],
  },
});
