// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for apps/dashboard/src/landing/freshness.ts — a zero-side-effect pure
 * module wired the day it was written (INSTRUCTIONS 2026-09-18: a new pure
 * module gets its own 100%-break config, so the per-change gate can select
 * it and the nightly sweep can never accumulate debt in it unseen).
 *
 * landingCodeIsStale() names the landing modules whose running build is
 * out of date. A surviving mutant here (a comparison flipped, the unreadable-
 * file guard removed, the note's text emptied) would either nag a fresh
 * server or stay silent for exactly the stale-guard refusals it exists to
 * explain — the two hand-restarts of 2026-09-17/18.
 *
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
export default {
  packageManager: 'pnpm',
  plugins: ['@stryker-mutator/vitest-runner'],
  testRunner: 'vitest',
  vitest: {
    // NOT the root vitest.config.ts — one test file, node env, no jsdom.
    configFile: 'config/mutation/vitest.dashboard-landing-freshness.config.ts',
  },
  mutate: ['apps/dashboard/src/landing/freshness.ts'],
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
  htmlReporter: { fileName: 'reports/mutation/dashboard-landing-freshness/index.html' },
  jsonReporter: { fileName: 'reports/mutation/dashboard-landing-freshness/mutation.json' },
  tempDirName: '.stryker-tmp-dashboard-landing-freshness',
};
