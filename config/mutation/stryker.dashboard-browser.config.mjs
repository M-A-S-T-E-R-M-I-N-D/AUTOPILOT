// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for apps/dashboard/src/browser.ts (backlog
 * web-msnswvcq-viays2, "MUTATION TESTING") — next after control/watchdog.ts.
 * browser.ts's only non-node import is `node:child_process`, never
 * `@autopilot/store`, so nothing native ever needs to load inside Stryker's
 * sandbox (see stryker.store.config.mjs's header for the documented
 * better-sqlite3 sandbox-resolution gap this sidesteps).
 *
 * `browserCommand` is the pure per-platform argv builder behind `openBrowser`
 * — the only thing standing between a printed loopback URL and a shell
 * command actually run on the operator's machine. A surviving mutant here
 * (a platform branch collapsed, the URL folded into `bin` instead of kept as
 * its own argv entry, the Windows title placeholder dropped) could silently
 * reopen a command-injection surface or simply break "open the dashboard."
 *
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
export default {
  packageManager: 'pnpm',
  plugins: ['@stryker-mutator/vitest-runner'],
  testRunner: 'vitest',
  vitest: {
    // NOT the root vitest.config.ts — see this file's header for why.
    configFile: 'config/mutation/vitest.dashboard-browser.config.ts',
  },
  mutate: ['apps/dashboard/src/browser.ts'],
  concurrency: 1,
  symlinkNodeModules: false,
  coverageAnalysis: 'perTest',
  thresholds: { high: 100, low: 100, break: 100 },
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/dashboard-browser/index.html' },
  jsonReporter: { fileName: 'reports/mutation/dashboard-browser/mutation.json' },
  tempDirName: '.stryker-tmp-dashboard-browser',
};
