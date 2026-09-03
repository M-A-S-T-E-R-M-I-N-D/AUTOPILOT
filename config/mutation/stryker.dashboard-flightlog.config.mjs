// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for apps/dashboard/src/read/flightlog.ts (backlog
 * web-msnswvcq-viays2, "MUTATION TESTING") — next after backups.ts
 * (stryker.dashboard-backups.config.mjs) in apps/dashboard/src/read/.
 *
 * `tailFlightLog` is the bounded-tail reader behind the dashboard's raw
 * flight-log view: it reads only the trailing 64KB of a flight's log file
 * and caps the returned line count, with explicit handling for a missing
 * file, an empty file, a zero/negative `maxLines`, and a read window that
 * starts mid-line. A surviving mutant here (e.g. the `maxLines <= 0` guard
 * loosened, the tail-window arithmetic off by one, or the partial-leading-
 * line drop removed) could mean a flight log renders truncated, doubled, or
 * mid-line garbage without anyone noticing.
 *
 * Same shape of good target backups.ts was: flightlog.ts imports only
 * `node:fs` (no `@autopilot/store`, no runtime better-sqlite3 load) and its
 * test file imports nothing but vitest and Node built-ins, so it sidesteps
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
    configFile: 'config/mutation/vitest.dashboard-flightlog.config.ts',
  },
  mutate: ['apps/dashboard/src/read/flightlog.ts'],
  concurrency: 1,
  symlinkNodeModules: false,
  coverageAnalysis: 'perTest',
  thresholds: { high: 100, low: 100, break: 100 },
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/dashboard-flightlog/index.html' },
  jsonReporter: { fileName: 'reports/mutation/dashboard-flightlog/mutation.json' },
  tempDirName: '.stryker-tmp-dashboard-flightlog',
};
