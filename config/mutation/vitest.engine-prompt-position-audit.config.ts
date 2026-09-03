// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * `packages/engine/src/prompt-position-audit.ts`-only Vitest config, used
 * exclusively by Stryker (stryker.engine-prompt-position-audit.config.mjs) —
 * NOT wired into `pnpm run test`, which keeps using the root config's
 * full-workspace run.
 *
 * Mirrors vitest.engine-routing.config.ts's reasoning: pointing Stryker's
 * dry run at the root config (or even all of packages/engine/test/) pulls in
 * adapters/git.test.ts's real `git` subprocess tests into the sandboxed copy
 * of the tree. prompt-position-audit.ts has zero imports (a fully
 * self-contained pure module — see its own file header) and its test file
 * imports nothing but vitest, prompt-position-audit.js, and the also
 * zero-import prompt.js, so scoping to just that one file sidesteps the
 * slow/crash-prone tests entirely and keeps every mutant's rerun fast.
 */
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  root: repoRoot,
  test: {
    globals: false,
    environment: 'node',
    include: ['packages/engine/test/prompt-position-audit.test.ts'],
  },
});
