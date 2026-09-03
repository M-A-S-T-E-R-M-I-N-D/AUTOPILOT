// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for packages/engine/src/containment.ts (backlog
 * web-msnswvcq-viays2, "MUTATION TESTING") — the fourth module wired after
 * store's rank.ts + schema.ts (stryker.store.config.mjs) and engine's
 * release.ts + pace.ts (stryker.engine-release.config.mjs,
 * stryker.engine-pace.config.mjs), widening one more self-contained slice.
 *
 * containment.ts is the same shape of good target release.ts and pace.ts
 * were: zero imports (a fully self-contained pure module — the flight
 * containment breach audit over an injected `HeadReader`, docs/FLIGHT-
 * CONTAINMENT.md's hard machine-checkable backstop, see the module's own
 * header) and its test file drives it through an in-memory fake, never a
 * real `git` subprocess or a database connection. It is also the highest-
 * value target mutated so far: a mutant surviving here would mean the
 * containment breach detector itself could silently miss an escaped flight.
 * Widening further (anything that still imports adapters/git.ts
 * transitively, or spawns a subprocess in its own tests) remains a
 * follow-up slice, same reasoning as the three prior configs.
 *
 * The two Windows-specific fixes below were required for the prior configs'
 * narrow scope even without a native addon or subprocess in the mutated
 * file itself — Stryker's sandboxed copy of the tree is enough on its own
 * to trip them — so both carry over here defensively.
 *
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
export default {
  packageManager: 'pnpm',
  plugins: ['@stryker-mutator/vitest-runner'],
  testRunner: 'vitest',
  vitest: {
    // NOT the root vitest.config.ts or packages/engine/test/**'s full suite
    // — see this file's header for why.
    configFile: 'config/mutation/vitest.engine-containment.config.ts',
  },
  mutate: ['packages/engine/src/containment.ts'],
  concurrency: 1,
  symlinkNodeModules: false,
  coverageAnalysis: 'perTest',
  thresholds: { high: 100, low: 100, break: 100 },
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/engine-containment/index.html' },
  jsonReporter: { fileName: 'reports/mutation/engine-containment/mutation.json' },
  tempDirName: '.stryker-tmp-engine-containment',
};
