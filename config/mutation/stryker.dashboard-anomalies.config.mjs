// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for apps/dashboard/src/read/anomalies.ts (backlog
 * web-msnswvcq-viays2, "MUTATION TESTING") — the first slice to widen
 * coverage into apps/dashboard, previously wired only across packages/store
 * (rank.ts, schema.ts) and packages/engine (see stryker.engine-*.config.mjs).
 *
 * anomalies.ts is the same shape of good target pace.ts/release.ts were: it
 * imports only a type from ./fleet.js (no @autopilot/store, no
 * better-sqlite3, no DOM), and its test file imports nothing but vitest and
 * anomalies.js — so it sidesteps both the sqlite-sandbox gap documented in
 * stryker.store.config.mjs (apps/dashboard's read models that DO open a real
 * store hit the identical `@autopilot/store` sandbox-copy problem and remain
 * out of scope) and the jsdom environment the rest of apps/dashboard/test/web
 * needs.
 *
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
export default {
  packageManager: 'pnpm',
  plugins: ['@stryker-mutator/vitest-runner'],
  testRunner: 'vitest',
  vitest: {
    // NOT the root vitest.config.ts — see this file's header for why.
    configFile: 'config/mutation/vitest.dashboard-anomalies.config.ts',
  },
  mutate: ['apps/dashboard/src/read/anomalies.ts'],
  concurrency: 1,
  symlinkNodeModules: false,
  coverageAnalysis: 'perTest',
  thresholds: { high: 100, low: 100, break: 100 },
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/dashboard-anomalies/index.html' },
  jsonReporter: { fileName: 'reports/mutation/dashboard-anomalies/mutation.json' },
  tempDirName: '.stryker-tmp-dashboard-anomalies',
};
