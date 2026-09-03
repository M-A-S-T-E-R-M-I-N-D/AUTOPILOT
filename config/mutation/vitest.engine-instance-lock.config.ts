// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * `packages/engine/src/adapters/instance-lock.ts`-only Vitest config, used
 * exclusively by Stryker (stryker.engine-instance-lock.config.mjs) — NOT
 * wired into `pnpm run test`, which keeps using the root config's
 * full-workspace run.
 *
 * Mirrors vitest.engine-clock.config.ts's reasoning: scoping to just
 * instance-lock.test.ts (which only ever touches the filesystem through a
 * temp dir and mocked `node:fs` functions, never a subprocess or database
 * connection) keeps every mutant's rerun fast and sidesteps pulling in the
 * rest of adapters/'s slower, crash-prone subprocess/native-binding tests.
 */
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  root: repoRoot,
  test: {
    globals: false,
    environment: 'node',
    include: ['packages/engine/test/adapters/instance-lock.test.ts'],
  },
});
