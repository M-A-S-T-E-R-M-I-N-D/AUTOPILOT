// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for apps/dashboard/src/flight/completion.ts (backlog
 * web-msnswvcq-viays2, "MUTATION TESTING") — next after budget.ts
 * (stryker.dashboard-budget.config.mjs), continuing to widen through
 * flight/'s other zero-import pure logic.
 *
 * `taskShouldClose` decides whether a firing's self-reported
 * `"completion":"slice"|"complete"` closes the board task it worked
 * (fly.ts's markTaskDoneIfShipped) or leaves it open for the next firing. A
 * surviving mutant here (a flipped `!==`, a swapped string literal) could
 * silently close a task that only got a partial slice done, or leave a
 * genuinely finished task open forever.
 *
 * Same shape of good target as budget.ts: zero imports (a fully
 * self-contained pure module — see the module's own file header) and
 * already exercised with concrete expected-output assertions by
 * completion.test.ts covering all three possible inputs ('complete',
 * 'slice', null), so it sidesteps the better-sqlite3-in-sandbox gap
 * documented in stryker.store.config.mjs.
 *
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
export default {
  packageManager: 'pnpm',
  plugins: ['@stryker-mutator/vitest-runner'],
  testRunner: 'vitest',
  vitest: {
    // NOT the root vitest.config.ts — see this file's header for why.
    configFile: 'config/mutation/vitest.dashboard-completion.config.ts',
  },
  mutate: ['apps/dashboard/src/flight/completion.ts'],
  concurrency: 1,
  symlinkNodeModules: false,
  coverageAnalysis: 'perTest',
  thresholds: { high: 100, low: 100, break: 100 },
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/dashboard-completion/index.html' },
  jsonReporter: { fileName: 'reports/mutation/dashboard-completion/mutation.json' },
  tempDirName: '.stryker-tmp-dashboard-completion',
};
