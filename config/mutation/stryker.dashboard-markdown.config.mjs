// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for apps/dashboard/src/web/markdown.ts — the docs reader's pure
 * block/inline helpers, spliced into the client by .toString(). Wired the
 * day the parity slice widened it (2026-09-18): a surviving mutant here is a
 * checklist that loses its ticks, a heading whose anchor no longer resolves,
 * a `javascript:` link that becomes clickable, or a `..` that climbs out of
 * the repository.
 *
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
export default {
  packageManager: 'pnpm',
  plugins: ['@stryker-mutator/vitest-runner'],
  testRunner: 'vitest',
  vitest: {
    // NOT the root vitest.config.ts — one test file, node env, no jsdom.
    configFile: 'config/mutation/vitest.dashboard-markdown.config.ts',
  },
  mutate: ['apps/dashboard/src/web/markdown.ts'],
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
  htmlReporter: { fileName: 'reports/mutation/dashboard-markdown/index.html' },
  jsonReporter: { fileName: 'reports/mutation/dashboard-markdown/mutation.json' },
  tempDirName: '.stryker-tmp-dashboard-markdown',
};
