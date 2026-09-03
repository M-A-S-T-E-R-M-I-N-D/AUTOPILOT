// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for apps/dashboard/src/flight/budget.ts (backlog
 * web-msnswvcq-viays2, "MUTATION TESTING") — next after live-firing.ts
 * (stryker.dashboard-live-firing.config.mjs), moving from the `shared/`
 * re-export modules into `flight/`'s other zero-import pure logic.
 *
 * `totalBudgetExhausted` is TOTAL-SPEND mode's stop decision for the fly-bar
 * budget toggle (flight/runner.ts): once what's left of the operator's
 * target can no longer fund another per-firing budget, the flight halts. A
 * surviving mutant here (an off-by-a-cent boundary, a flipped comparison, an
 * `&&`/`||` swap around the `undefined` check) could silently keep spending
 * past the operator's cap, or stop a fixed-firings flight that was never
 * meant to check a budget at all.
 *
 * Same shape of good target as live-firing.ts: zero imports (a fully
 * self-contained pure module — see the module's own file header) and
 * already exercised with concrete expected-output assertions by
 * budget.test.ts, including both sides of the boundary, so it sidesteps the
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
    configFile: 'config/mutation/vitest.dashboard-budget.config.ts',
  },
  mutate: ['apps/dashboard/src/flight/budget.ts'],
  concurrency: 1,
  symlinkNodeModules: false,
  coverageAnalysis: 'perTest',
  thresholds: { high: 100, low: 100, break: 100 },
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/dashboard-budget/index.html' },
  jsonReporter: { fileName: 'reports/mutation/dashboard-budget/mutation.json' },
  tempDirName: '.stryker-tmp-dashboard-budget',
};
