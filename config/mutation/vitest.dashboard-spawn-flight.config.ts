// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * `apps/dashboard/src/flight/spawn-flight.ts`-only Vitest config, used
 * exclusively by Stryker (stryker.dashboard-spawn-flight.config.mjs) — NOT
 * wired into `pnpm run test`, which keeps using the root config's
 * full-workspace run.
 *
 * Mirrors vitest.dashboard-worktree.config.ts's reasoning: scoped to just
 * spawn-flight.test.ts, which mocks `node:child_process` entirely — no
 * native binding, nothing else to drag into the sandbox.
 */
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  root: repoRoot,
  test: {
    globals: false,
    environment: 'node',
    include: ['apps/dashboard/test/flight/spawn-flight.test.ts'],
  },
});
