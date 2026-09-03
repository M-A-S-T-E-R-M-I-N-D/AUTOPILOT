// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for packages/engine/src/release.ts (backlog
 * web-msnswvcq-viays2, "MUTATION TESTING") — the second module wired after
 * store's rank.ts + schema.ts (stryker.store.config.mjs), and the first
 * slice of "packages/engine isn't wired at all yet" from that config's
 * follow-up note.
 *
 * release.ts is a deliberately good first engine target: it has zero
 * imports (a fully self-contained pure module — SemVer bump computation,
 * changelog section cutting, release planning/execution over injected
 * `Releasable`/`ReleaseWriter` fakes) and its test file never shells a real
 * `git` subprocess or opens a database connection. That sidesteps BOTH
 * blockers stryker.store.config.mjs documents for widening further:
 * GitVcs's real-git-subprocess tests (adapters/git.test.ts, minutes-to-hours
 * under mutation) and better-sqlite3's native-addon coverage-collection gap
 * on Windows. Widening to the rest of packages/engine (anything that still
 * imports adapters/git.ts transitively, or spawns a subprocess in its own
 * tests) remains a follow-up slice, same reasoning as store's.
 *
 * The two Windows-specific fixes below were required for store's narrow
 * scope even without a native addon or subprocess in the mutated file
 * itself — Stryker's sandboxed copy of the tree is enough on its own to
 * trip them — so both carry over here defensively.
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
    configFile: 'config/mutation/vitest.engine-release.config.ts',
  },
  mutate: ['packages/engine/src/release.ts'],
  concurrency: 1,
  symlinkNodeModules: false,
  coverageAnalysis: 'perTest',
  thresholds: { high: 100, low: 100, break: 100 },
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/engine-release/index.html' },
  jsonReporter: { fileName: 'reports/mutation/engine-release/mutation.json' },
  tempDirName: '.stryker-tmp-engine-release',
};
