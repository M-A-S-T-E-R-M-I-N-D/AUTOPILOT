// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for apps/dashboard/src/paths.ts (backlog
 * web-msnswvcq-viays2, "MUTATION TESTING") — continuing to widen through
 * apps/dashboard/src's zero-side-effect pure logic.
 *
 * samePath() decides whether a project's stored `root_path` matches a folder
 * the caller passed in — including the win32 case-insensitive comparison
 * NTFS actually uses. A surviving mutant here (the platform check inverted,
 * `toLowerCase` dropped, or `resolve` skipped) could make a real project
 * look unmatched — or two different folders look like the same one.
 *
 * paths.ts has zero runtime imports beyond node:path — same low-risk shape
 * as gate-commands.ts/registry.ts/runner.ts/rate-limit.ts, never touches the
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
    configFile: 'config/mutation/vitest.dashboard-paths.config.ts',
  },
  mutate: ['apps/dashboard/src/paths.ts'],
  concurrency: 1,
  symlinkNodeModules: false,
  coverageAnalysis: 'perTest',
  thresholds: { high: 100, low: 100, break: 100 },
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/dashboard-paths/index.html' },
  jsonReporter: { fileName: 'reports/mutation/dashboard-paths/mutation.json' },
  tempDirName: '.stryker-tmp-dashboard-paths',
};
