// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * `packages/onboarding/src/backup/secret-guard.ts`-only Vitest config, used
 * exclusively by Stryker (stryker.onboarding-secret-guard.config.mjs) — NOT
 * wired into `pnpm run test`, which keeps using the root config's
 * full-workspace run.
 *
 * Mirrors vitest.engine-guard.config.ts's reasoning: pointing Stryker's dry
 * run at the root config (or even all of packages/onboarding/test/) pulls in
 * adapters/sqlite-project-store.test.ts and adapters/git-backup.test.ts's
 * real better-sqlite3/git subprocess tests into the sandboxed copy of the
 * tree — the exact combination stryker.store.config.mjs documents as
 * unresolved for packages/store's sqlite-backed modules. secret-guard.ts
 * imports only `node:fs` and `node:path` — no sqlite, no subprocess, no
 * workspace package — so scoping to just secret-guard.test.ts sidesteps that
 * blocker entirely and keeps every mutant's rerun fast.
 */
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  root: repoRoot,
  test: {
    globals: false,
    environment: 'node',
    include: ['packages/onboarding/test/backup/secret-guard.test.ts'],
  },
});
