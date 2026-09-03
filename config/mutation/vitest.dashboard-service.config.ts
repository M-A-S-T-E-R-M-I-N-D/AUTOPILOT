// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * `apps/dashboard/src/connection/service.ts`-only Vitest config, used
 * exclusively by Stryker (stryker.dashboard-service.config.mjs) — NOT wired
 * into `pnpm run test`, which keeps using the root config's full-workspace
 * run.
 *
 * Mirrors vitest.dashboard-connection-config.config.ts's reasoning:
 * service.ts's only bare-specifier workspace import is `@autopilot/engine`
 * (for `describeAuth`/`AuthConfig`/`AuthMode` directly, plus
 * `parseModelEnvelope` transitively via verify.ts's `verifyClaudeAuth`),
 * which `symlinkNodeModules: false` never recreates inside Stryker's
 * sandboxed copy, so `vitest --related` silently finds no related tests.
 * Those two symbols live in different leaf modules (auth.ts and
 * adapters/claude-cli.ts), so a single-file alias can't satisfy both —
 * aliasing to shim.dashboard-service-engine.ts (which re-exports both from
 * their real sources) sidesteps the missing symlink entirely. The rest of
 * service.ts's imports (./config.js, ./cli-probe.js, ./verify.js) are
 * relative and resolve fine inside the sandbox.
 *
 * `root` is pinned back to the repo root explicitly: Vitest defaults `root`
 * to this config file's own directory (config/mutation/), which would
 * otherwise resolve `include` against the wrong tree.
 */
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  root: repoRoot,
  resolve: {
    alias: {
      '@autopilot/engine': fileURLToPath(
        new URL('./shim.dashboard-service-engine.ts', import.meta.url),
      ),
    },
  },
  test: {
    globals: false,
    environment: 'node',
    include: ['apps/dashboard/test/connection/service.test.ts'],
  },
});
