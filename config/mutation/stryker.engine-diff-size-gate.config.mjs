// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for packages/engine/src/diff-size-gate.ts — the module that
 * decides whether a firing's diff is small enough to survive, so a surviving
 * mutant here is a threshold or exemption the tests do not actually pin.
 *
 * Same shape as every other pure-module config in this directory (see
 * stryker.engine-pace.config.mjs): a scoped Vitest config instead of the root
 * one, concurrency 1, and a 100% break threshold — the bar this project holds
 * pure, fake-driven modules to.
 */
export default {
  packageManager: 'pnpm',
  plugins: ['@stryker-mutator/vitest-runner'],
  testRunner: 'vitest',
  vitest: {
    // NOT the root vitest.config.ts or packages/engine/test/**'s full suite
    // — see this file's header for why.
    configFile: 'config/mutation/vitest.engine-diff-size-gate.config.ts',
  },
  mutate: ['packages/engine/src/diff-size-gate.ts'],
  concurrency: 1,
  symlinkNodeModules: false,
  coverageAnalysis: 'perTest',
  thresholds: { high: 100, low: 100, break: 100 },
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/engine-diff-size-gate/index.html' },
  jsonReporter: { fileName: 'reports/mutation/engine-diff-size-gate/mutation.json' },
  tempDirName: '.stryker-tmp-engine-diff-size-gate',
};
