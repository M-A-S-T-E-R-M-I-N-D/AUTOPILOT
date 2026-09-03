// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * `apps/dashboard/src/ask/service.ts`-only Vitest config, used exclusively
 * by Stryker (stryker.dashboard-ask.config.mjs) — NOT wired into `pnpm run
 * test`, which keeps using the root config's full-workspace run.
 *
 * service.ts's only bare-specifier workspace import is `@autopilot/engine`
 * (buildAskPrompt/ASK_PROMPT_VERSION/LIVE_STATE_LABEL/VIEW_CONTEXT_LABEL/
 * AskSource/AskTurn), which `symlinkNodeModules: false` never recreates
 * inside Stryker's sandboxed copy, so `vitest --related` silently finds no
 * related tests (same root cause documented in
 * vitest.dashboard-lock.config.ts). Every one of those symbols lives in the
 * single self-contained leaf module packages/engine/src/ask.ts (no imports
 * of its own beyond types), so — unlike vitest.dashboard-service.config.ts's
 * two-module case — aliasing straight to it satisfies the whole import.
 */
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  root: repoRoot,
  resolve: {
    alias: {
      '@autopilot/engine': fileURLToPath(
        new URL('../../packages/engine/src/ask.ts', import.meta.url),
      ),
    },
  },
  test: {
    globals: false,
    environment: 'node',
    include: ['apps/dashboard/test/ask/service.test.ts'],
  },
});
