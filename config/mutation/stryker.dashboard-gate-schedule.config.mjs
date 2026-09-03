// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for apps/dashboard/src/flight/gate-schedule.ts (backlog
 * web-msnswvcq-viays2, "MUTATION TESTING") — next after runner.ts
 * (stryker.dashboard-runner.config.mjs), continuing to widen through
 * flight/'s other zero-import pure logic.
 *
 * gate-schedule.ts decides whether a firing runs the full test suite or the
 * impacted-only fast path (`isFullTestRunDue`, `selectTestCommand`). A
 * surviving mutant here (a flipped modulo boundary, or picking `test` when
 * `testImpacted` should have won, or vice versa) could silently skip the
 * scheduled full-suite safety net or make every firing pay the full-suite
 * cost the fast path exists to avoid.
 *
 * Same shape of good target as runner.ts: zero runtime imports (its only
 * import is `import type`, erased at compile time) and exercised with
 * concrete expected-output assertions by gate-schedule.test.ts.
 *
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
export default {
  packageManager: 'pnpm',
  plugins: ['@stryker-mutator/vitest-runner'],
  testRunner: 'vitest',
  vitest: {
    // NOT the root vitest.config.ts — see this file's header for why.
    configFile: 'config/mutation/vitest.dashboard-gate-schedule.config.ts',
  },
  mutate: ['apps/dashboard/src/flight/gate-schedule.ts'],
  concurrency: 1,
  symlinkNodeModules: false,
  coverageAnalysis: 'perTest',
  thresholds: { high: 100, low: 100, break: 100 },
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/dashboard-gate-schedule/index.html' },
  jsonReporter: { fileName: 'reports/mutation/dashboard-gate-schedule/mutation.json' },
  tempDirName: '.stryker-tmp-dashboard-gate-schedule',
};
