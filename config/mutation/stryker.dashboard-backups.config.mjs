// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for apps/dashboard/src/read/backups.ts (backlog
 * web-msnswvcq-viays2, "MUTATION TESTING") — next after anomalies.ts
 * (stryker.dashboard-anomalies.config.mjs) in apps/dashboard/src/read/.
 *
 * `resolveSnapshotTarget` is the selection logic behind `dashboard:restore`
 * (docs for that CLI live in restore.ts): it picks which on-disk snapshot a
 * `pnpm run dashboard:restore <arg>` invocation actually restores. A
 * surviving mutant here (e.g. the `'latest'` sentinel check inverted or
 * loosened, or the oldest-first index arithmetic off by one) could mean the
 * wrong backup silently gets restored.
 *
 * Same shape of good target anomalies.ts was: backups.ts imports only a
 * `type` from `@autopilot/store` (erased at compile — no runtime
 * better-sqlite3 load, so it never hits the sandbox-copy gap documented in
 * stryker.store.config.mjs) and its test file imports nothing but vitest and
 * backups.js.
 *
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
export default {
  packageManager: 'pnpm',
  plugins: ['@stryker-mutator/vitest-runner'],
  testRunner: 'vitest',
  vitest: {
    // NOT the root vitest.config.ts — see this file's header for why.
    configFile: 'config/mutation/vitest.dashboard-backups.config.ts',
  },
  mutate: ['apps/dashboard/src/read/backups.ts'],
  concurrency: 1,
  symlinkNodeModules: false,
  coverageAnalysis: 'perTest',
  thresholds: { high: 100, low: 100, break: 100 },
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/dashboard-backups/index.html' },
  jsonReporter: { fileName: 'reports/mutation/dashboard-backups/mutation.json' },
  tempDirName: '.stryker-tmp-dashboard-backups',
};
