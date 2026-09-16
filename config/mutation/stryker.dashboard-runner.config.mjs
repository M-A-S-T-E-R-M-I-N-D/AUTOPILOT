// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for apps/dashboard/src/flight/runner.ts (backlog
 * web-msnswvcq-viays2, "MUTATION TESTING") — next after triage.ts
 * (stryker.dashboard-triage.config.mjs), continuing to widen through
 * flight/'s other zero-import pure logic.
 *
 * runner.ts is the FlightRunner — the dashboard's "fly this folder" backing
 * service: it clamps operator-supplied firings/budget/totalBudgetUsd, decides
 * fixed-firings vs TOTAL-SPEND mode, spawns the real flight (every effect —
 * spawn, folder check, clock, pause — injected via FlightRunnerDeps), and
 * tracks running/paused/queued status through start/stop/pause and the
 * child's exit. A surviving mutant here (a dropped budget floor, a flipped
 * one-flight-at-a-time guard, or a lost paused/initiatedBy transition) could
 * silently let an operator overspend or lose track of what's actually
 * flying.
 *
 * Same shape of good target as triage.ts: zero imports (every dependency is
 * injected, not imported) and exercised with concrete expected-output
 * assertions by runner.test.ts.
 *
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
export default {
  packageManager: 'pnpm',
  plugins: ['@stryker-mutator/vitest-runner'],
  testRunner: 'vitest',
  vitest: {
    // NOT the root vitest.config.ts — see this file's header for why.
    configFile: 'config/mutation/vitest.dashboard-runner.config.ts',
  },
  mutate: ['apps/dashboard/src/flight/runner.ts'],
  concurrency: 1,
  symlinkNodeModules: false,
  coverageAnalysis: 'perTest',
  // Static mutants are out of scope (2026-09-16). Stryker's own term for a
  // mutant "only executed during the loading of a file": a module-level
  // constant is built once at import, BEFORE a mutant can be activated for a
  // given test, so no test can kill one and writing more would not change
  // that. They are an artifact of WHERE the code runs, not evidence of an
  // untested invariant — the store config's own comment works the case
  // through in full. Mutants inside functions that tests call are unaffected,
  // including functions the module also calls at load time.
  ignoreStatic: true,
  thresholds: { high: 100, low: 100, break: 100 },
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/dashboard-runner/index.html' },
  jsonReporter: { fileName: 'reports/mutation/dashboard-runner/mutation.json' },
  tempDirName: '.stryker-tmp-dashboard-runner',
};
