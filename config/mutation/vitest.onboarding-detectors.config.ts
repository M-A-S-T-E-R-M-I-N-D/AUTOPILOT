// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * `packages/onboarding/src/gate/detectors/{js,python,go,rust}.ts`-only
 * Vitest config, used exclusively by Stryker
 * (stryker.onboarding-detectors.config.mjs) — NOT wired into
 * `pnpm run test`, which keeps using the root config's full-workspace run.
 *
 * detect.test.ts calls `detectGate` with its default detector list (the four
 * real ecosystem detectors, not stubs), so it already exercises every
 * detector's branches end to end — no separate detector-only test file
 * needed. Pure — no filesystem, no `git`, no better-sqlite3 — so it never
 * touches the sandbox gap documented in stryker.store.config.mjs. Scoping to
 * just detect.test.ts keeps every mutant's rerun fast.
 */
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  root: repoRoot,
  test: {
    globals: false,
    environment: 'node',
    include: ['packages/onboarding/test/gate/detect.test.ts'],
  },
});
