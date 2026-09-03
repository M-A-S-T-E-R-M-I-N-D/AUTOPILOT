// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * `apps/dashboard/src/landing/self-restart.ts`-only Vitest config, used
 * exclusively by Stryker (stryker.dashboard-self-restart.config.mjs) — NOT
 * wired into `pnpm run test`, which keeps using the root config's
 * full-workspace run.
 *
 * self-restart.ts has zero workspace-package imports (only node:child_process
 * and the already-mutation-tested ../ready.js) — every collaborator
 * (BuildRunner, RestartTarget, verifyHealth, exit) is injected, so its test
 * file exercises it entirely through fakes. Scoping to just that one test
 * file sidesteps the root config's jsdom env-matching and the rest of the
 * dashboard suite entirely, keeping every mutant's rerun fast.
 */
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  root: repoRoot,
  test: {
    globals: false,
    environment: 'node',
    include: ['apps/dashboard/test/landing/self-restart.test.ts'],
  },
});
