// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for apps/dashboard/src/read/config.ts (backlog
 * web-msnswvcq-viays2, "MUTATION TESTING") — next after flightlog.ts
 * (stryker.dashboard-flightlog.config.mjs) in apps/dashboard/src/read/.
 *
 * `resolveDbPath` decides which on-disk file every dashboard entrypoint
 * (cli.ts, demo.ts, flight.ts, fly.ts, reset.ts, restore.ts, server/main.ts)
 * opens as the store. Before this file, it was exercised only indirectly
 * through source.test.ts (which never covers the empty-string override
 * branch). Wiring Stryker here also caught genuinely dead logic: the
 * original `override && override.length > 0` guard was equivalent to a
 * plain truthiness check for the `string | undefined` type it guards
 * (a non-empty string is never falsy), so no test could ever kill a mutant
 * on the redundant `.length > 0` half — it's been simplified away. A
 * surviving mutant here now (e.g. the join() argument order/literal
 * changed) could point every command at the wrong database without anyone
 * noticing.
 *
 * Same shape of good target flightlog.ts was: config.ts imports only
 * `node:path` (no `@autopilot/store`, no runtime better-sqlite3 load) and
 * its test file imports nothing but vitest and config.js, so it sidesteps
 * the sqlite sandbox-copy gap documented in stryker.store.config.mjs and the
 * jsdom environment the rest of apps/dashboard/test/web needs.
 *
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
export default {
  packageManager: 'pnpm',
  plugins: ['@stryker-mutator/vitest-runner'],
  testRunner: 'vitest',
  vitest: {
    // NOT the root vitest.config.ts — see this file's header for why.
    configFile: 'config/mutation/vitest.dashboard-config.config.ts',
  },
  mutate: ['apps/dashboard/src/read/config.ts'],
  concurrency: 1,
  symlinkNodeModules: false,
  coverageAnalysis: 'perTest',
  thresholds: { high: 100, low: 100, break: 100 },
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/dashboard-config/index.html' },
  jsonReporter: { fileName: 'reports/mutation/dashboard-config/mutation.json' },
  tempDirName: '.stryker-tmp-dashboard-config',
};
