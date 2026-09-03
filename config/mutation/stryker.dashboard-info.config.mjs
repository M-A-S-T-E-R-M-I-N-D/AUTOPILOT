// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for apps/dashboard/src/info.ts (backlog
 * web-msnswvcq-viays2, "MUTATION TESTING") — next after ritual-lock.ts
 * (stryker.dashboard-ritual-lock.config.mjs), continuing to widen through
 * the app's other zero-import pure logic.
 *
 * `dashboardInfo()` and its constants back `/api/health` and the dashboard's
 * own self-description; DASHBOARD_VERSION also gates the "workspace package
 * vs product release" distinction routes.test.ts relies on. A surviving
 * mutant (a blanked string, an emptied DASHBOARD_SCREENS array, an emptied
 * dashboardInfo() return object) could silently ship a broken identity
 * response without any test noticing.
 *
 * Same shape of good target as backlog.ts: zero imports (a fully
 * self-contained pure module) and exercised with concrete expected-output
 * assertions by info.test.ts — the full dashboardInfo() descriptor via
 * `toEqual`, the exact DASHBOARD_SCREENS array, DASHBOARD_VERSION pinned to
 * its literal, and PRODUCT_VERSION checked against a semver shape (not a
 * hardcoded literal, since it's bumped every release) plus distinctness from
 * DASHBOARD_VERSION.
 *
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
export default {
  packageManager: 'pnpm',
  plugins: ['@stryker-mutator/vitest-runner'],
  testRunner: 'vitest',
  vitest: {
    // NOT the root vitest.config.ts — see this file's header for why.
    configFile: 'config/mutation/vitest.dashboard-info.config.ts',
  },
  mutate: ['apps/dashboard/src/info.ts'],
  concurrency: 1,
  symlinkNodeModules: false,
  coverageAnalysis: 'perTest',
  thresholds: { high: 100, low: 100, break: 100 },
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/dashboard-info/index.html' },
  jsonReporter: { fileName: 'reports/mutation/dashboard-info/mutation.json' },
  tempDirName: '.stryker-tmp-dashboard-info',
};
