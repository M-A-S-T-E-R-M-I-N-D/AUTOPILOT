// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * `apps/dashboard/src/flight/worktree.ts`-only Vitest config, used
 * exclusively by Stryker (stryker.dashboard-worktree.config.mjs) — NOT
 * wired into `pnpm run test`, which keeps using the root config's
 * full-workspace run.
 *
 * Mirrors vitest.dashboard-gate-schedule.config.ts's reasoning: scoped to
 * just worktree.test.ts (the pure deriveWorktreePlan unit test), NOT
 * worktree-containment-escape.test.ts, which spins up real temp git repos
 * and would make every mutant's rerun slow for no extra kill power over
 * deriveWorktreePlan itself.
 */
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  root: repoRoot,
  resolve: {
    alias: {
      // @autopilot/onboarding was imported by the mutated module but never aliased, so
      // inside the sandbox (symlinkNodeModules: false) it could not resolve:
      // the test file failed to import, Stryker reported "No tests were found"
      // and exited before testing a single mutant. This config crashed that way
      // on every nightly, producing NO report at all — so the module looked
      // accounted-for while being mutation-tested not at all (2026-09-17).
      // Aliased to the leaf module that actually defines slugify.
      '@autopilot/onboarding': fileURLToPath(
        new URL('../../packages/onboarding/src/onboard/soul.ts', import.meta.url),
      ),
    },
  },
  test: {
    globals: false,
    environment: 'node',
    include: ['apps/dashboard/test/flight/worktree.test.ts'],
  },
});
