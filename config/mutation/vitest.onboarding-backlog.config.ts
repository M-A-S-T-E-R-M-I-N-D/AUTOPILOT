// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * `packages/onboarding/src/onboard/backlog.ts`-only Vitest config, used
 * exclusively by Stryker (stryker.onboarding-backlog.config.mjs) — NOT
 * wired into `pnpm run test`, which keeps using the root config's
 * full-workspace run.
 *
 * backlog.test.ts touches only the pure `makeFsSnapshot` helper (no
 * `node:fs`, no better-sqlite3 anywhere on backlog.ts's import graph — its
 * only runtime import is the `FsSnapshot` type), so it never touches the
 * sandbox gap documented in stryker.store.config.mjs. Scoping to just
 * backlog.test.ts keeps every mutant's rerun fast.
 */
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  root: repoRoot,
  test: {
    globals: false,
    environment: 'node',
    include: ['packages/onboarding/test/onboard/backlog.test.ts'],
  },
});
