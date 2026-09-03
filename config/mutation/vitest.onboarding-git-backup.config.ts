// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * `packages/onboarding/src/adapters/git-backup.ts`-only Vitest config, used
 * exclusively by Stryker (stryker.onboarding-git-backup.config.mjs) — NOT
 * wired into `pnpm run test`, which keeps using the root config's
 * full-workspace run.
 *
 * git-backup.test.ts mocks `node:child_process`'s `execFile` in-process (no
 * real `git` subprocess) and touches disposable tmpdir directories for the
 * huge-file fixture — no better-sqlite3, no `@autopilot/store` import — so
 * it never touches the sandbox gap documented in stryker.store.config.mjs.
 * Scoping to just git-backup.test.ts keeps every mutant's rerun fast.
 */
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  root: repoRoot,
  test: {
    globals: false,
    environment: 'node',
    include: ['packages/onboarding/test/adapters/git-backup.test.ts'],
  },
});
