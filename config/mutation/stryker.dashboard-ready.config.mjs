// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for apps/dashboard/src/ready.ts (backlog
 * web-msnswvcq-viays2, "MUTATION TESTING") — continuing to widen through
 * apps/dashboard/src's zero-side-effect pure logic.
 *
 * waitForHealth() is the launch-sequence race guard: it decides whether the
 * dashboard's CLI opens a browser tab before the detached server is actually
 * listening. A surviving mutant here (the `res.ok` check flipped, the
 * `now() < deadline` boundary off by one, or the retry loop swallowing the
 * wrong error) could open a browser onto a connection-refused page, or spin
 * forever past the caller's timeout.
 *
 * ready.ts has zero runtime imports — same low-risk shape as
 * security.ts/gate-commands.ts/registry.ts, never touches the
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
    configFile: 'config/mutation/vitest.dashboard-ready.config.ts',
  },
  mutate: ['apps/dashboard/src/ready.ts'],
  concurrency: 1,
  symlinkNodeModules: false,
  coverageAnalysis: 'perTest',
  thresholds: { high: 100, low: 100, break: 100 },
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/dashboard-ready/index.html' },
  jsonReporter: { fileName: 'reports/mutation/dashboard-ready/mutation.json' },
  tempDirName: '.stryker-tmp-dashboard-ready',
};
