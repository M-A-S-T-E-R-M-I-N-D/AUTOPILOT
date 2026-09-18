// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for apps/dashboard/src/flight/flight-end.ts — a zero-side-effect pure
 * module wired the day it was written (INSTRUCTIONS 2026-09-18: a new pure
 * module gets its own 100%-break config, so the per-change gate can select
 * it and the nightly sweep can never accumulate debt in it unseen).
 *
 * flightEndStatus() decides what a project is left as when ONE of its
 * flights ends. A surviving mutant here (the sibling check dropped, the
 * pause branch inverted) would put a 2-lane round back to `flying=0` the
 * moment the first lane lands — the exact 2026-09-18 bug it was written for.
 *
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
export default {
  packageManager: 'pnpm',
  plugins: ['@stryker-mutator/vitest-runner'],
  testRunner: 'vitest',
  vitest: {
    // NOT the root vitest.config.ts — one test file, node env, no jsdom.
    configFile: 'config/mutation/vitest.dashboard-flight-end.config.ts',
  },
  mutate: ['apps/dashboard/src/flight/flight-end.ts'],
  // Same sandbox hygiene as every other config here (see
  // stryker.dashboard-paths.config.mjs for the measurements behind each line).
  ignorePatterns: ['.autopilot', '.stryker-tmp*', 'reports', 'test-results', 'dist'],
  cleanTempDir: 'always',
  concurrency: 1,
  symlinkNodeModules: false,
  coverageAnalysis: 'perTest',
  ignoreStatic: true,
  thresholds: { high: 100, low: 100, break: 100 },
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/dashboard-flight-end/index.html' },
  jsonReporter: { fileName: 'reports/mutation/dashboard-flight-end/mutation.json' },
  tempDirName: '.stryker-tmp-dashboard-flight-end',
};
