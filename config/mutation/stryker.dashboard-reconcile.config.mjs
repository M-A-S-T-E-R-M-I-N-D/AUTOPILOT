// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for apps/dashboard/src/read/reconcile.ts (backlog
 * web-msnswvcq-viays2, "MUTATION TESTING") — next after config.ts
 * (stryker.dashboard-config.config.mjs) in apps/dashboard/src/read/.
 *
 * `titleMatchScore`, `filePathMatchesTitle`, and `findReconciliationCandidates`
 * decide whether a shipped commit gets proposed to auto-close an open board
 * task ("Board hygiene", BACKLOG-999). A surviving mutant here — a loosened
 * Jaccard boundary, a flipped `score < threshold` comparison, the `done`-task
 * skip removed, or the strongest-match tie-break dropped — could mean a task
 * is proposed done on a spurious match, or a genuinely shipped task never
 * gets surfaced at all.
 *
 * Same shape of good target config.ts was: reconcile.ts imports only a type
 * (`TaskEntry` from fleet.js, erased at compile time — no runtime
 * `@autopilot/store` or better-sqlite3 load) and its test file imports
 * nothing but vitest and reconcile.js, so it sidesteps the sqlite
 * sandbox-copy gap documented in stryker.store.config.mjs and the jsdom
 * environment the rest of apps/dashboard/test/web needs.
 *
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
export default {
  packageManager: 'pnpm',
  plugins: ['@stryker-mutator/vitest-runner'],
  testRunner: 'vitest',
  vitest: {
    // NOT the root vitest.config.ts — see this file's header for why.
    configFile: 'config/mutation/vitest.dashboard-reconcile.config.ts',
  },
  mutate: ['apps/dashboard/src/read/reconcile.ts'],
  concurrency: 1,
  symlinkNodeModules: false,
  coverageAnalysis: 'perTest',
  thresholds: { high: 100, low: 100, break: 100 },
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/dashboard-reconcile/index.html' },
  jsonReporter: { fileName: 'reports/mutation/dashboard-reconcile/mutation.json' },
  tempDirName: '.stryker-tmp-dashboard-reconcile',
};
