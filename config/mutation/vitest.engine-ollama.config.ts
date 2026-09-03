// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * `packages/engine/src/adapters/ollama.ts`-only Vitest config, used
 * exclusively by Stryker (stryker.engine-ollama.config.mjs) — NOT wired into
 * `pnpm run test`, which keeps using the root config's full-workspace run.
 *
 * Mirrors vitest.engine-otlp.config.ts's reasoning: pointing Stryker's dry
 * run at the root config (or even all of packages/engine/test/) pulls in
 * adapters/git.test.ts's real `git` subprocess tests, and any test that
 * opens a real `@autopilot/store` connection, into the sandboxed copy of the
 * tree. ollama.ts's only runtime import is a type-only import from
 * `../ports.js` plus the injectable `fetchImpl` its own tests fake — no
 * adapters/git.ts, no subprocess, no workspace package, no real network
 * call. Scoping to just ollama.test.ts sidesteps the slow/crash-prone tests
 * entirely and keeps every mutant's rerun fast.
 */
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  root: repoRoot,
  test: {
    globals: false,
    environment: 'node',
    include: ['packages/engine/test/adapters/ollama.test.ts'],
  },
});
