// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for apps/dashboard/src/flight/lock.ts (backlog
 * web-msnswvcq-viays2, "MUTATION TESTING") — next after worktree.ts
 * (stryker.dashboard-worktree.config.mjs), continuing to widen through
 * flight/'s other pure logic.
 *
 * lock.ts's three exports key per-project lock files, flight log files, and
 * derived project ids — PARALLEL FLIGHTS' guarantee that independent
 * projects never contend on a shared lock or interleave log output depends
 * on these staying keyed correctly. A surviving mutant (e.g. dropping the
 * projectId from the template string) could silently reopen that
 * cross-project contention.
 *
 * Only imports are `node:path` (builtin) and `@autopilot/onboarding`'s
 * `slugify` (pure, already unit-tested there) — nothing to mock.
 *
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
export default {
  packageManager: 'pnpm',
  plugins: ['@stryker-mutator/vitest-runner'],
  testRunner: 'vitest',
  vitest: {
    // NOT the root vitest.config.ts — see this file's header for why.
    configFile: 'config/mutation/vitest.dashboard-lock.config.ts',
  },
  mutate: ['apps/dashboard/src/flight/lock.ts'],
  concurrency: 1,
  symlinkNodeModules: false,
  coverageAnalysis: 'perTest',
  thresholds: { high: 100, low: 100, break: 100 },
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/dashboard-lock/index.html' },
  jsonReporter: { fileName: 'reports/mutation/dashboard-lock/mutation.json' },
  tempDirName: '.stryker-tmp-dashboard-lock',
};
