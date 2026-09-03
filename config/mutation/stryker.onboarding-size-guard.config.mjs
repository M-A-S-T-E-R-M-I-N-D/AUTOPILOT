// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for packages/onboarding/src/backup/size-guard.ts
 * (backlog web-msnswvcq-viays2, "MUTATION TESTING") — third onboarding
 * module wired after secret-guard.ts and guard.ts+refs.ts
 * (stryker.onboarding-guard.config.mjs).
 *
 * scanForHugeFiles walks a tree flagging any file above
 * MAX_STAGED_FILE_BYTES (GitHub's 100MB hard push limit) so the baseline
 * ritual can refuse to stage one before it becomes permanent, additive-only
 * history. A surviving mutant here (the `<=` size comparison flipped, the
 * `.git`/`node_modules` skip-set weakened, or the symlink guard dropped)
 * would mean an oversized or unwanted file slips into the baseline commit
 * unflagged.
 *
 * size-guard.ts's only runtime imports are `node:fs` and `node:path` —
 * neither reaches better-sqlite3 or `@autopilot/store`. size-guard.test.ts
 * exercises it against disposable tmpdir directories with `node:fs` partially
 * mocked in-process for the device-entry and stat-race fixtures, so it never
 * touches the sandbox gap documented in stryker.store.config.mjs.
 *
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
export default {
  packageManager: 'pnpm',
  plugins: ['@stryker-mutator/vitest-runner'],
  testRunner: 'vitest',
  vitest: {
    // NOT the root vitest.config.ts — see this file's header for why.
    configFile: 'config/mutation/vitest.onboarding-size-guard.config.ts',
  },
  mutate: ['packages/onboarding/src/backup/size-guard.ts'],
  concurrency: 1,
  symlinkNodeModules: false,
  coverageAnalysis: 'perTest',
  thresholds: { high: 100, low: 100, break: 100 },
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/onboarding-size-guard/index.html' },
  jsonReporter: { fileName: 'reports/mutation/onboarding-size-guard/mutation.json' },
  tempDirName: '.stryker-tmp-onboarding-size-guard',
};
