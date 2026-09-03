// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * `packages/onboarding/src/index/core.ts`-only Vitest config, used
 * exclusively by Stryker (stryker.onboarding-index-core.config.mjs) — NOT
 * wired into `pnpm run test`, which keeps using the root config's
 * full-workspace run.
 *
 * core.test.ts is pure — only `node:crypto` hashing plus in-memory sorting —
 * so it never touches the sandbox gap documented in stryker.store.config.mjs.
 * Scoping to just core.test.ts keeps every mutant's rerun fast.
 */
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  root: repoRoot,
  test: {
    globals: false,
    environment: 'node',
    include: ['packages/onboarding/test/index/core.test.ts'],
  },
});
