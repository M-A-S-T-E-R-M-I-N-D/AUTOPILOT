// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for packages/onboarding/src/adapters/ignore.ts
 * (backlog web-msnswvcq-viays2, "MUTATION TESTING") — eighth onboarding
 * module wired after secret-guard.ts, guard.ts+refs.ts, size-guard.ts,
 * ritual.ts, task-id.ts, soul.ts, and git-backup.ts
 * (stryker.onboarding-git-backup.config.mjs).
 *
 * IGNORE_DIRS is the shared denylist fs-file-source.ts and fs-snapshot.ts
 * both consult before walking into a subdirectory during gate detection or
 * indexing. It is the ONLY thing standing between AUTOPILOT's own
 * `.autopilot`/`.autopilot-run` working dirs — which hold the live SQLite DB
 * and, in key/token mode, `connection.json`'s auth secrets — and those files
 * getting walked into the search index when the tool is flown on itself. A
 * surviving mutant here (a dropped or blanked-out entry) would silently
 * reopen that exact leak the next time a target repo happens to be
 * AUTOPILOT's own working tree.
 *
 * ignore.ts has no imports at all — a single `Set` literal. ignore.test.ts
 * exercises it directly, no filesystem, no `git`, no better-sqlite3, so it
 * never touches the sandbox gap documented in stryker.store.config.mjs.
 *
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
export default {
  packageManager: 'pnpm',
  plugins: ['@stryker-mutator/vitest-runner'],
  testRunner: 'vitest',
  vitest: {
    // NOT the root vitest.config.ts — see this file's header for why.
    configFile: 'config/mutation/vitest.onboarding-ignore.config.ts',
  },
  mutate: ['packages/onboarding/src/adapters/ignore.ts'],
  concurrency: 1,
  symlinkNodeModules: false,
  coverageAnalysis: 'perTest',
  thresholds: { high: 100, low: 100, break: 100 },
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/onboarding-ignore/index.html' },
  jsonReporter: { fileName: 'reports/mutation/onboarding-ignore/mutation.json' },
  tempDirName: '.stryker-tmp-onboarding-ignore',
};
