// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * `packages/engine/src/guard-hook.ts`-only Vitest config, used exclusively by
 * Stryker (stryker.engine-guard-hook.config.mjs) — NOT wired into `pnpm run
 * test`, which keeps using the root config's full-workspace run.
 *
 * Mirrors vitest.engine-info.config.ts's reasoning: pointing Stryker's dry
 * run at the root config (or even all of packages/engine/test/) pulls in
 * adapters/git.test.ts's real `git` subprocess tests into the sandboxed copy
 * of the tree. guard-hook.ts imports `evaluateHookInput` from `./guard.js` —
 * a real runtime import, unlike the type-only imports of prior modules — but
 * guard.ts itself imports only `fileURLToPath` from `node:url`, so no
 * adapters/git.ts or subprocess is ever pulled in transitively. Scoping to
 * just guard-hook.test.ts sidesteps the slow/crash-prone tests entirely and
 * keeps every mutant's rerun fast.
 */
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  root: repoRoot,
  test: {
    globals: false,
    environment: 'node',
    include: ['packages/engine/test/guard-hook.test.ts'],
  },
});
