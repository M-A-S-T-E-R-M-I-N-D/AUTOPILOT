// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * `packages/engine/src/stream.ts`-only Vitest config, used exclusively by
 * Stryker (stryker.engine-stream.config.mjs) — NOT wired into `pnpm run
 * test`, which keeps using the root config's full-workspace run.
 *
 * Mirrors vitest.engine-guard.config.ts's reasoning: pointing Stryker's dry
 * run at the root config (or even all of packages/engine/test/) pulls in
 * adapters/git.test.ts's real `git` subprocess tests into the sandboxed copy
 * of the tree. stream.ts has NO runtime imports at all — it is pure NDJSON
 * parsing — so no adapters/git.ts, no subprocess, no workspace package.
 * Scoping to just stream.test.ts sidesteps the slow/crash-prone tests
 * entirely and keeps every mutant's rerun fast.
 */
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  root: repoRoot,
  test: {
    globals: false,
    environment: 'node',
    include: ['packages/engine/test/stream.test.ts'],
  },
});
