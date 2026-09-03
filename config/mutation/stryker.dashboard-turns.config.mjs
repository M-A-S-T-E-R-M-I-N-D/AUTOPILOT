// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for apps/dashboard/src/shared/turns.ts (backlog
 * web-msnswvcq-viays2, "MUTATION TESTING") — next after callsign.ts
 * (stryker.dashboard-callsign.config.mjs), continuing to widen into the
 * pure `shared/` modules `read/fleet.ts` re-exports.
 *
 * `countTurns` approximates the number of assistant turns behind a run of
 * activity rows by collapsing consecutive rows that share the same
 * model/tokensIn/tokensOut/reasoning tuple. A surviving mutant here (the key
 * comparison, the collapsing condition, the increment, or the tuple fields
 * themselves) could silently mis-report a firing's turn count on the live
 * worker card without any test noticing.
 *
 * Same shape of good target as callsign.ts: zero imports (fully
 * self-contained — see the module's own file header) and its logic is
 * exercised with concrete expected-output assertions by fleet.test.ts's
 * `describe('countTurns', ...)` block, so it sidesteps the
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
    configFile: 'config/mutation/vitest.dashboard-turns.config.ts',
  },
  mutate: ['apps/dashboard/src/shared/turns.ts'],
  concurrency: 1,
  symlinkNodeModules: false,
  coverageAnalysis: 'perTest',
  thresholds: { high: 100, low: 100, break: 100 },
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/dashboard-turns/index.html' },
  jsonReporter: { fileName: 'reports/mutation/dashboard-turns/mutation.json' },
  tempDirName: '.stryker-tmp-dashboard-turns',
};
