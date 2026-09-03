// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * `packages/engine/src/adapters/remediating-gate.ts`-only Vitest config,
 * used exclusively by Stryker (stryker.engine-remediating-gate.config.mjs)
 * — NOT wired into `pnpm run test`, which keeps using the root config's
 * full-workspace run.
 *
 * Mirrors vitest.engine-guard.config.ts's reasoning: pointing Stryker's dry
 * run at the root config (or even all of packages/engine/test/**) pulls in
 * adapters/git.test.ts's real `git` subprocess tests into the sandboxed copy
 * of the tree. remediating-gate.ts's only runtime imports are `../ports.js`
 * and `./gate.js` — both `import type`, erased at compile time — and
 * remediating-gate.test.ts drives it entirely through in-memory
 * `GatePort`/`VcsPort` fakes, never a real subprocess or database
 * connection, so scoping to just that one file sidesteps the
 * slow/crash-prone tests entirely and keeps every mutant's rerun fast.
 */
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  root: repoRoot,
  test: {
    globals: false,
    environment: 'node',
    include: ['packages/engine/test/adapters/remediating-gate.test.ts'],
  },
});
