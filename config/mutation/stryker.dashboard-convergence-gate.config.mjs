// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for apps/dashboard/src/flight/convergence-gate.ts — the
 * verdict on a merged branch after a lane's sync-back: green, red (naming
 * the failing check AND quoting the failing command's own last lines, since
 * 2026-09-19), or demoted to UNVERIFIABLE when a green ran too fast to be
 * real. A surviving mutant here is a convergence alarm that lies: the red
 * line without the test that broke, the plausibility floor ignored, the
 * wrong duration persisted. The module is pure (its gate, clock history and
 * telemetry sinks are injected), so its test file is the whole harness.
 *
 * Runs Vitest through a scoped config (vitest.dashboard-convergence-gate
 * .config.ts) rather than the root vitest.config.ts — same reasoning as the
 * other dashboard configs here: one test file, fast mutant reruns.
 */
export default {
  packageManager: 'pnpm',
  plugins: ['@stryker-mutator/vitest-runner'],
  testRunner: 'vitest',
  vitest: {
    // related: false — REQUIRED, not a preference (same as stryker.dashboard-ask
    // .config.mjs): the module imports `median` from @autopilot/store, and
    // inside the sandbox (symlinkNodeModules: false) vitest's --related lookup
    // cannot resolve that relation and finds NO tests — "No tests were
    // executed. Stryker will exit prematurely." The vitest config below already
    // scopes include to exactly the one test file this module needs.
    related: false,
    // NOT the root vitest.config.ts — see this file's header for why.
    configFile: 'config/mutation/vitest.dashboard-convergence-gate.config.ts',
  },
  mutate: ['apps/dashboard/src/flight/convergence-gate.ts'],
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
  htmlReporter: { fileName: 'reports/mutation/dashboard-convergence-gate/index.html' },
  jsonReporter: { fileName: 'reports/mutation/dashboard-convergence-gate/mutation.json' },
  tempDirName: '.stryker-tmp-dashboard-convergence-gate',
};
