// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for packages/engine/src/pace.ts (backlog
 * web-msnswvcq-viays2, "MUTATION TESTING") — the third module wired after
 * store's rank.ts + schema.ts (stryker.store.config.mjs) and engine's
 * release.ts (stryker.engine-release.config.mjs), widening
 * "packages/engine isn't wired at all yet" one more self-contained slice.
 *
 * pace.ts is the same shape of good target release.ts was: zero imports (a
 * fully self-contained pure module — adaptive-cadence arithmetic over a
 * plain SpendSnapshot/PaceConfig) and its test file never shells a real
 * `git` subprocess or opens a database connection. Widening to the rest of
 * packages/engine (anything that still imports adapters/git.ts transitively,
 * or spawns a subprocess in its own tests) remains a follow-up slice, same
 * reasoning as release.ts's and store's own config.
 *
 * The two Windows-specific fixes below were required for both prior configs'
 * narrow scope even without a native addon or subprocess in the mutated file
 * itself — Stryker's sandboxed copy of the tree is enough on its own to trip
 * them — so both carry over here defensively.
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
    configFile: 'config/mutation/vitest.engine-pace.config.ts',
  },
  mutate: ['packages/engine/src/pace.ts'],
  concurrency: 1,
  symlinkNodeModules: false,
  coverageAnalysis: 'perTest',
  thresholds: { high: 100, low: 100, break: 100 },
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/engine-pace/index.html' },
  jsonReporter: { fileName: 'reports/mutation/engine-pace/mutation.json' },
  tempDirName: '.stryker-tmp-engine-pace',
};
