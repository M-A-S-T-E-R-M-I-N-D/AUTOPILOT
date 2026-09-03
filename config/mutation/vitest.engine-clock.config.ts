// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * `packages/engine/src/adapters/clock.ts`-only Vitest config, used
 * exclusively by Stryker (stryker.engine-clock.config.mjs) — NOT wired into
 * `pnpm run test`, which keeps using the root config's full-workspace run.
 *
 * Mirrors vitest.engine-remediating-gate.config.ts's reasoning: scoping to
 * just clock.test.ts (which only ever touches `SystemClock` through fake
 * timers, never a subprocess or database connection) keeps every mutant's
 * rerun fast and sidesteps pulling in the rest of adapters/'s slower,
 * crash-prone subprocess/native-binding tests.
 */
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  root: repoRoot,
  test: {
    globals: false,
    environment: 'node',
    include: ['packages/engine/test/adapters/clock.test.ts'],
  },
});
