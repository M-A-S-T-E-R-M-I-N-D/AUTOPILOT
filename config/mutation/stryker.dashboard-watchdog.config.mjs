// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for apps/dashboard/src/control/watchdog.ts (backlog
 * web-msnswvcq-viays2, "MUTATION TESTING") — next after control/state.ts.
 * watchdog.ts's non-node imports are control.ts/state.ts/types.ts, none of
 * which touch `@autopilot/store`, so nothing native ever needs to load
 * inside Stryker's sandbox (see stryker.store.config.mjs's header for the
 * documented better-sqlite3 sandbox-resolution gap this sidesteps).
 *
 * watchdogTick/runWatchdog are the RING-0 SUPERVISOR's decision loop: one
 * tick observes `status()` and starts only when NOT already running, so a
 * single branch covers revive-after-crash and replace-a-stale-record alike.
 * A surviving mutant here (the `state === 'running'` check flipped or
 * dropped, `revived` reported backwards, the interval timer never cleared
 * on abort) could silently reopen "watchdog restarts a healthy server" or
 * "watchdog never revives a dead one."
 *
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
export default {
  packageManager: 'pnpm',
  plugins: ['@stryker-mutator/vitest-runner'],
  testRunner: 'vitest',
  vitest: {
    // NOT the root vitest.config.ts — see this file's header for why.
    configFile: 'config/mutation/vitest.dashboard-watchdog.config.ts',
  },
  mutate: ['apps/dashboard/src/control/watchdog.ts'],
  concurrency: 1,
  symlinkNodeModules: false,
  coverageAnalysis: 'perTest',
  thresholds: { high: 100, low: 100, break: 100 },
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/dashboard-watchdog/index.html' },
  jsonReporter: { fileName: 'reports/mutation/dashboard-watchdog/mutation.json' },
  tempDirName: '.stryker-tmp-dashboard-watchdog',
};
