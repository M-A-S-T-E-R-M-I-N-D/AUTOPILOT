// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * `packages/engine/src/adapters/claude-cli.ts`-only Vitest config, used
 * exclusively by Stryker (stryker.engine-claude-cli.config.mjs) — NOT wired
 * into `pnpm run test`, which keeps using the root config's full-workspace
 * run.
 *
 * Mirrors vitest.engine-gate.config.ts's reasoning: scoping to just
 * claude-cli.test.ts (which mocks `node:child_process` outright via
 * `vi.mock` — never a real subprocess or database connection) keeps every
 * mutant's rerun fast and sidesteps pulling in the rest of adapters/'s
 * slower, crash-prone subprocess/native-binding tests.
 */
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  root: repoRoot,
  test: {
    globals: false,
    environment: 'node',
    include: ['packages/engine/test/adapters/claude-cli.test.ts'],
  },
});
