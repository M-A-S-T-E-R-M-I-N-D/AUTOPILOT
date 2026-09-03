// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * `packages/onboarding/src/backup/errors.ts`-only Vitest config, used
 * exclusively by Stryker (stryker.onboarding-errors.config.mjs) — NOT wired
 * into `pnpm run test`, which keeps using the root config's full-workspace
 * run.
 *
 * errors.test.ts is pure — no filesystem, no `git`, no better-sqlite3 — so
 * it never touches the sandbox gap documented in stryker.store.config.mjs.
 * Scoping to just errors.test.ts keeps every mutant's rerun fast.
 */
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  root: repoRoot,
  test: {
    globals: false,
    environment: 'node',
    include: ['packages/onboarding/test/backup/errors.test.ts'],
  },
});
