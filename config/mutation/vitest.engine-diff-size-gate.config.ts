// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * `packages/engine/src/diff-size-gate.ts`-only Vitest config, used exclusively
 * by Stryker (stryker.engine-diff-size-gate.config.mjs) — NOT wired into
 * `pnpm run test`, which keeps using the root config's full-workspace run.
 *
 * Same reasoning as vitest.engine-pace.config.ts: pointing Stryker at the root
 * config (or even all of packages/engine/test/) drags adapters/git.test.ts's
 * real `git` subprocesses into every mutant's sandboxed copy of the tree.
 * diff-size-gate.ts carries only a type-only import (erased at runtime) and
 * its test imports nothing but vitest and the module itself, so scoping to
 * that one file keeps every mutant's rerun fast.
 */
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  root: repoRoot,
  test: {
    globals: false,
    environment: 'node',
    include: ['packages/engine/test/diff-size-gate.test.ts'],
  },
});
