// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for packages/onboarding/src/info.ts
 * (backlog web-msnswvcq-viays2, "MUTATION TESTING") — ninth onboarding
 * module wired after secret-guard.ts, guard.ts+refs.ts, size-guard.ts,
 * ritual.ts, task-id.ts, soul.ts, git-backup.ts, and ignore.ts
 * (stryker.onboarding-ignore.config.mjs).
 *
 * onboardingInfo() returns the static capability descriptor the CLI and
 * dashboard read to know which first-lock ritual steps exist and in what
 * order (MASTER-PLAN §3, ACTION-PLAN M2) — `backup-myth` and
 * `baseline-legacy` must stay first or a caller that renders the ritual
 * checklist would show the safety steps out of order. A surviving mutant
 * here (a dropped or reordered step, or a silently changed `name`/`version`)
 * would ship that wrong descriptor with a fully green gate.
 *
 * info.ts has no imports at all — two literals and a function that returns
 * them. info.test.ts exercises it directly, no filesystem, no `git`, no
 * better-sqlite3, so it never touches the sandbox gap documented in
 * stryker.store.config.mjs.
 *
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
export default {
  packageManager: 'pnpm',
  plugins: ['@stryker-mutator/vitest-runner'],
  testRunner: 'vitest',
  vitest: {
    // NOT the root vitest.config.ts — see this file's header for why.
    configFile: 'config/mutation/vitest.onboarding-info.config.ts',
  },
  mutate: ['packages/onboarding/src/info.ts'],
  concurrency: 1,
  symlinkNodeModules: false,
  coverageAnalysis: 'perTest',
  thresholds: { high: 100, low: 100, break: 100 },
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/onboarding-info/index.html' },
  jsonReporter: { fileName: 'reports/mutation/onboarding-info/mutation.json' },
  tempDirName: '.stryker-tmp-onboarding-info',
};
