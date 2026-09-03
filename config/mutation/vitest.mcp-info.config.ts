// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * `packages/mcp/src/info.ts`-only Vitest config, used exclusively by
 * Stryker (stryker.mcp-info.config.mjs) — NOT wired into `pnpm run test`,
 * which keeps using the root config's full-workspace run.
 *
 * info.ts has zero imports (a static capability descriptor) and is
 * exercised with concrete expected-output assertions by info.test.ts.
 * Scoping to just that one test file keeps every mutant's rerun fast.
 */
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  root: repoRoot,
  test: {
    globals: false,
    environment: 'node',
    include: ['packages/mcp/test/info.test.ts'],
  },
});
