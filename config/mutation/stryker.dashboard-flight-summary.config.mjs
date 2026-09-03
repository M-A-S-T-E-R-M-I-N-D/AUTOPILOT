// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for apps/dashboard/src/shared/flight-summary.ts (backlog
 * web-msnswvcq-viays2, "MUTATION TESTING") — next after narrator.ts
 * (stryker.dashboard-narrator.config.mjs), continuing to widen into the
 * pure `shared/` modules `read/fleet.ts` re-exports.
 *
 * `flightHeadlineOf`/`finishedFlightSummaries` resolve the ONE honest
 * headline shown for each shipped flight-log row. A surviving mutant here
 * (a swapped fallback order, a broken 'slice' completion branch, a wrong
 * closed-task-title condition) could silently misattribute what a flight
 * actually shipped without any test noticing.
 *
 * Same shape of good target as narrator.ts/turns.ts: zero imports (fully
 * self-contained — see the module's own file header) and its logic is
 * exercised with concrete expected-output assertions by fleet.test.ts's
 * `describe('finishedFlightSummaries', ...)` block, so it sidesteps the
 * better-sqlite3-in-sandbox gap documented in stryker.store.config.mjs.
 *
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
export default {
  packageManager: 'pnpm',
  plugins: ['@stryker-mutator/vitest-runner'],
  testRunner: 'vitest',
  vitest: {
    // NOT the root vitest.config.ts — see this file's header for why.
    configFile: 'config/mutation/vitest.dashboard-flight-summary.config.ts',
  },
  mutate: ['apps/dashboard/src/shared/flight-summary.ts'],
  concurrency: 1,
  symlinkNodeModules: false,
  coverageAnalysis: 'perTest',
  thresholds: { high: 100, low: 100, break: 100 },
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/dashboard-flight-summary/index.html' },
  jsonReporter: { fileName: 'reports/mutation/dashboard-flight-summary/mutation.json' },
  tempDirName: '.stryker-tmp-dashboard-flight-summary',
};
