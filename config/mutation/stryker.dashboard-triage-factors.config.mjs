// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for apps/dashboard/src/flight/triage-factors.ts (backlog
 * web-msnswvcq-viays2, "MUTATION TESTING") — widening one more self-contained
 * slice, same "zero imports, concrete expected-output assertions" shape
 * stryker.dashboard-triage.config.mjs and stryker.engine-pace.config.mjs
 * already proved.
 *
 * triage-factors.ts is the runaway-task guard under board triage (founder
 * directive, distilled from the $240 mutation-testing lesson in
 * docs/RESEARCH-LIBRARY.md): a task burning heavy budget across many firings
 * without ever completing gets demoted to the queue's tail for operator
 * review, deterministically — never left to the model's judgment. A
 * surviving mutant here (a flipped streak/spend comparison, an off-by-one in
 * the demotion threshold, a reset condition that never fires) would silently
 * let a real runaway keep floating to the top of triage — exactly the
 * failure mode this module exists to prevent.
 *
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
export default {
  packageManager: 'pnpm',
  plugins: ['@stryker-mutator/vitest-runner'],
  testRunner: 'vitest',
  vitest: {
    // NOT the root vitest.config.ts — see this file's header for why.
    configFile: 'config/mutation/vitest.dashboard-triage-factors.config.ts',
  },
  mutate: ['apps/dashboard/src/flight/triage-factors.ts'],
  concurrency: 1,
  symlinkNodeModules: false,
  coverageAnalysis: 'perTest',
  thresholds: { high: 100, low: 100, break: 100 },
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/dashboard-triage-factors/index.html' },
  jsonReporter: { fileName: 'reports/mutation/dashboard-triage-factors/mutation.json' },
  tempDirName: '.stryker-tmp-dashboard-triage-factors',
};
