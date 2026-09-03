// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * `packages/onboarding/src/backup/size-guard.ts`-only Vitest config, used
 * exclusively by Stryker (stryker.onboarding-size-guard.config.mjs) — NOT
 * wired into `pnpm run test`, which keeps using the root config's
 * full-workspace run.
 *
 * size-guard.test.ts only touches `node:fs` (partially mocked for the
 * device-entry and stat-race fixtures) and disposable tmpdir directories —
 * no better-sqlite3, no `@autopilot/store` import — so it never touches the
 * sandbox gap documented in stryker.store.config.mjs. Scoping to just
 * size-guard.test.ts keeps every mutant's rerun fast.
 */
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  root: repoRoot,
  test: {
    globals: false,
    environment: 'node',
    include: ['packages/onboarding/test/backup/size-guard.test.ts'],
  },
});
