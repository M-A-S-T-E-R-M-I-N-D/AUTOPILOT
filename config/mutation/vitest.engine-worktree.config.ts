// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * `packages/engine/src/adapters/worktree.ts`-only Vitest config, used
 * exclusively by Stryker (stryker.engine-worktree.config.mjs) — NOT wired
 * into `pnpm run test`, which keeps using the root config's full-workspace
 * run.
 *
 * Mirrors vitest.engine-git.config.ts's reasoning: scoping to just
 * worktree.test.ts keeps every mutant's rerun fast. Like git.test.ts,
 * worktree.test.ts spawns a REAL `git` binary against throwaway tmpdir
 * repos — no `node:child_process` mock and no `@autopilot/store` import —
 * so it never touches the better-sqlite3-in-sandbox gap documented in
 * stryker.store.config.mjs.
 */
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  root: repoRoot,
  test: {
    globals: false,
    environment: 'node',
    include: ['packages/engine/test/adapters/worktree.test.ts'],
  },
});
