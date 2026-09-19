// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for apps/dashboard/src/flight/lane-head.ts — the rule
 * that only a gate-judged lane head is ever published into the shared
 * flight branch (four-lane rung, 2026-09-19: an `unverifiable` commit was
 * synced back and broke the flight branch's gate). A surviving mutant here
 * is a publication rule that lies: a red checkpoint read as green, an
 * unverifiable head read as verified, a parked head forgotten across a
 * launch. The module is pure; its test file is the whole harness.
 *
 * Runs Vitest through a scoped config (vitest.dashboard-lane-head.config.ts)
 * rather than the root vitest.config.ts — one test file, fast mutant reruns,
 * same reasoning as the other dashboard configs here.
 */
export default {
  packageManager: 'pnpm',
  plugins: ['@stryker-mutator/vitest-runner'],
  testRunner: 'vitest',
  vitest: {
    // NOT the root vitest.config.ts — see this file's header for why.
    configFile: 'config/mutation/vitest.dashboard-lane-head.config.ts',
  },
  mutate: ['apps/dashboard/src/flight/lane-head.ts'],
  // The sandbox is a COPY of the repo; the runtime state under .autopilot
  // (the live SQLite db and every backup) is never read by a test — see
  // stryker.dashboard-anomalies.config.mjs for the measured effect.
  ignorePatterns: ['.autopilot', '.stryker-tmp*', 'reports', 'test-results', 'dist'],
  cleanTempDir: 'always',
  concurrency: 1,
  symlinkNodeModules: false,
  coverageAnalysis: 'perTest',
  // Static mutants are out of scope — see stryker.dashboard-anomalies
  // .config.mjs and the store config for the full reasoning.
  ignoreStatic: true,
  thresholds: { high: 100, low: 100, break: 100 },
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/dashboard-lane-head/index.html' },
  jsonReporter: { fileName: 'reports/mutation/dashboard-lane-head/mutation.json' },
  tempDirName: '.stryker-tmp-dashboard-lane-head',
};
