// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for packages/onboarding/src/onboard/task-id.ts
 * (backlog web-msnswvcq-viays2, "MUTATION TESTING") — fifth onboarding
 * module wired after secret-guard.ts, guard.ts+refs.ts, size-guard.ts, and
 * ritual.ts (stryker.onboarding-ritual.config.mjs).
 *
 * taskIdSource mints `<prefix>-<time36>-<nonce36×6>-<seq>` ids for seed
 * tasks written into the shared, permanent `tasks` table. A surviving
 * mutant here (dropping the clock or nonce from the id, starting `seq` at
 * the wrong value, or reusing state across calls to the factory) would
 * reopen the exact regression the module's docstring describes: the second
 * project a user onboards collides with the first board's ids and crashes
 * the whole flight with `UNIQUE constraint failed: tasks.id`.
 *
 * task-id.ts has no imports at all — pure computation over its `now` and
 * `random` injected params. task-id.test.ts exercises it directly, no
 * filesystem, no `git`, no better-sqlite3.
 *
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
export default {
  packageManager: 'pnpm',
  plugins: ['@stryker-mutator/vitest-runner'],
  testRunner: 'vitest',
  vitest: {
    // NOT the root vitest.config.ts — see this file's header for why.
    configFile: 'config/mutation/vitest.onboarding-task-id.config.ts',
  },
  mutate: ['packages/onboarding/src/onboard/task-id.ts'],
  concurrency: 1,
  symlinkNodeModules: false,
  coverageAnalysis: 'perTest',
  thresholds: { high: 100, low: 100, break: 100 },
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/onboarding-task-id/index.html' },
  jsonReporter: { fileName: 'reports/mutation/onboarding-task-id/mutation.json' },
  tempDirName: '.stryker-tmp-onboarding-task-id',
};
