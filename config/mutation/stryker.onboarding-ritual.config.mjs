// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for packages/onboarding/src/backup/ritual.ts
 * (backlog web-msnswvcq-viays2, "MUTATION TESTING") — fourth onboarding
 * module wired after secret-guard.ts, guard.ts+refs.ts, and size-guard.ts
 * (stryker.onboarding-size-guard.config.mjs).
 *
 * lockRepo is the folder-lock ritual itself (MASTER-PLAN §7): anchor a
 * baseline commit, tag MYTH+LEGACY at HEAD, then move onto the flight
 * branch — never touching working-tree state before the tags exist, and
 * never `reset --hard`. A surviving mutant here (skipping the baseline
 * commit on a non-empty unborn repo, tagging before the commit, resuming a
 * repo that isn't actually backed up, or dropping the flight-branch
 * checkout) would mean AUTOPILOT fires against a repo it never actually
 * captured.
 *
 * ritual.ts's only runtime imports are `./refs.js` and `./types.js`
 * (type-only) — neither reaches better-sqlite3 or `@autopilot/store`.
 * ritual.test.ts exercises it through GitBackup (real `git` subprocess
 * against disposable tmpdir repos, same shape as stryker.onboarding-guard's
 * guard.test.ts) — `git` is a system binary already on PATH inside
 * Stryker's sandbox, nothing workspace-scoped to copy in.
 *
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
export default {
  packageManager: 'pnpm',
  plugins: ['@stryker-mutator/vitest-runner'],
  testRunner: 'vitest',
  vitest: {
    // NOT the root vitest.config.ts — see this file's header for why.
    configFile: 'config/mutation/vitest.onboarding-ritual.config.ts',
  },
  mutate: ['packages/onboarding/src/backup/ritual.ts'],
  concurrency: 1,
  symlinkNodeModules: false,
  coverageAnalysis: 'perTest',
  thresholds: { high: 100, low: 100, break: 100 },
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/onboarding-ritual/index.html' },
  jsonReporter: { fileName: 'reports/mutation/onboarding-ritual/mutation.json' },
  tempDirName: '.stryker-tmp-onboarding-ritual',
};
