// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * `packages/engine/src/adapters/gate.ts`-only Vitest config, used
 * exclusively by Stryker (stryker.engine-gate.config.mjs) — NOT wired into
 * `pnpm run test`, which keeps using the root config's full-workspace run.
 *
 * Mirrors vitest.engine-fs-control.config.ts's reasoning: scoping to just
 * gate.test.ts and gate-exec.test.ts (which only ever spawn a handful of
 * short-lived real subprocesses via the default `execFile` seam, or mock
 * `node:child_process` outright — never a database connection) keeps every
 * mutant's rerun fast and sidesteps pulling in the rest of adapters/'s
 * slower, crash-prone subprocess/native-binding tests.
 */
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  root: repoRoot,
  test: {
    globals: false,
    environment: 'node',
    include: [
      'packages/engine/test/adapters/gate.test.ts',
      'packages/engine/test/adapters/gate-exec.test.ts',
    ],
  },
});
