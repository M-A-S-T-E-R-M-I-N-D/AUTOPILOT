// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for apps/dashboard/src/flight/preflight.ts — the go/no-go
 * a flight gets before it spends a dollar (2026-09-19: every failure class
 * of the lane ladder had a precondition a check could have named at
 * takeoff). A surviving mutant here is a preflight that lies: a dirty
 * checkout read as clean, a missing identity waved through, a full disk
 * called fine. The module is pure; its test file is the whole harness.
 *
 * Runs Vitest through a scoped config (vitest.dashboard-preflight.config.ts)
 * rather than the root vitest.config.ts — one test file, fast mutant reruns.
 */
export default {
  packageManager: 'pnpm',
  plugins: ['@stryker-mutator/vitest-runner'],
  testRunner: 'vitest',
  vitest: {
    // NOT the root vitest.config.ts — see this file's header for why.
    configFile: 'config/mutation/vitest.dashboard-preflight.config.ts',
  },
  mutate: ['apps/dashboard/src/flight/preflight.ts'],
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
  htmlReporter: { fileName: 'reports/mutation/dashboard-preflight/index.html' },
  jsonReporter: { fileName: 'reports/mutation/dashboard-preflight/mutation.json' },
  tempDirName: '.stryker-tmp-dashboard-preflight',
};
