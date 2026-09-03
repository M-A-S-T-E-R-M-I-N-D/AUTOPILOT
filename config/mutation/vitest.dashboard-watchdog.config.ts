// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * `apps/dashboard/src/control/watchdog.ts`-only Vitest config, used
 * exclusively by Stryker (stryker.dashboard-watchdog.config.mjs) — NOT
 * wired into `pnpm run test`, which keeps using the root config's
 * full-workspace run.
 *
 * Mirrors vitest.dashboard-state.config.ts's reasoning: scoped to just
 * watchdog.test.ts, whose only non-node imports are control.ts/state.ts/
 * types.ts (no `@autopilot/store`, no native binding) — nothing else to
 * drag into the sandbox.
 */
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  root: repoRoot,
  test: {
    globals: false,
    environment: 'node',
    include: ['apps/dashboard/test/control/watchdog.test.ts'],
  },
});
