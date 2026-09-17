// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * `apps/dashboard/src/ask/service.ts`-only Vitest config, used exclusively
 * by Stryker (stryker.dashboard-ask.config.mjs) — NOT wired into `pnpm run
 * test`, which keeps using the root config's full-workspace run.
 *
 * service.ts's direct workspace import is `@autopilot/engine`
 * (buildAskPrompt/ASK_PROMPT_VERSION/LIVE_STATE_LABEL/VIEW_CONTEXT_LABEL/
 * AskSource/AskTurn), which `symlinkNodeModules: false` never recreates
 * inside Stryker's sandboxed copy, so `vitest --related` silently finds no
 * related tests (same root cause documented in
 * vitest.dashboard-lock.config.ts). Every one of those symbols lives in the
 * single self-contained leaf module packages/engine/src/ask.ts (no imports
 * of its own beyond types), so — unlike vitest.dashboard-service.config.ts's
 * two-module case — aliasing straight to it satisfies the whole import.
 *
 * Further down the chain (architect-proposal.ts → control-execute.ts) sits a
 * RUNTIME import of `openStore` from `@autopilot/store`, whose source in turn
 * imports two native modules. This config used to answer that with
 * `symlinkNodeModules: true` — which ran here and left the Linux runners
 * with "No tests were found" on every sweep (observed twice, 2026-09-17;
 * the cause was not isolated). So instead: the store's SOURCE is aliased
 * from the sandbox copy, and its two native modules are resolved from the
 * real checkout — found by walking up from this file until the workspace
 * manifest and the installed module both exist, which holds whether this
 * file runs from the checkout or from a sandbox copied beneath it. No
 * symlink is involved on any OS, and the suite never opens a database.
 */
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

/** The checkout that owns the installed node_modules — this directory when
 *  vitest runs in place, its ancestor when Stryker runs a sandbox copy. */
function installedRoot(from: string): string {
  let dir = from;
  for (;;) {
    if (
      existsSync(join(dir, 'pnpm-workspace.yaml')) &&
      existsSync(join(dir, 'packages', 'store', 'node_modules', 'better-sqlite3'))
    ) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) return from;
    dir = parent;
  }
}

const installed = installedRoot(repoRoot);
const storeRequire = createRequire(join(installed, 'packages', 'store', 'package.json'));
// control-execute.ts also imports the control tools from `@autopilot/mcp`,
// every one of which lives in the leaf packages/mcp/src/control.ts — whose
// own two bare imports (the MCP SDK's server entry and zod) are installed
// under packages/mcp only, so they resolve from there the same way.
const mcpRequire = createRequire(join(installed, 'packages', 'mcp', 'package.json'));

export default defineConfig({
  root: repoRoot,
  resolve: {
    alias: {
      '@autopilot/engine': fileURLToPath(
        new URL('../../packages/engine/src/ask.ts', import.meta.url),
      ),
      '@autopilot/store': fileURLToPath(
        new URL('../../packages/store/src/index.ts', import.meta.url),
      ),
      '@autopilot/mcp': fileURLToPath(
        new URL('../../packages/mcp/src/control.ts', import.meta.url),
      ),
      'better-sqlite3': storeRequire.resolve('better-sqlite3'),
      'sqlite-vec': storeRequire.resolve('sqlite-vec'),
      '@modelcontextprotocol/sdk/server/mcp.js': mcpRequire.resolve(
        '@modelcontextprotocol/sdk/server/mcp.js',
      ),
      zod: dirname(mcpRequire.resolve('zod/package.json')),
    },
  },
  test: {
    globals: false,
    environment: 'node',
    include: ['apps/dashboard/test/ask/service.test.ts'],
  },
});
