// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for packages/onboarding/src/backup/secret-guard.ts
 * (backlog web-msnswvcq-viays2, "MUTATION TESTING") — packages/onboarding's
 * first wired module. Every other module in this backlog lives in
 * packages/engine, packages/store, packages/tokens, or apps/dashboard;
 * packages/onboarding was never started because most of its surface
 * (adapters/sqlite-project-store.ts, adapters/sqlite-index-store.ts,
 * adapters/git-backup.ts) hits the same better-sqlite3/git-subprocess
 * sandbox blocker stryker.store.config.mjs documents in detail.
 *
 * secret-guard.ts sidesteps that blocker: its only imports are `node:fs` and
 * `node:path` (see vitest.onboarding-secret-guard.config.ts) — same safe
 * shape as guard.ts and the other twenty-six packages/engine modules already
 * wired. It is also the guard that stands between a gitignore-less
 * onboarding target and `git add -A` committing a live credential: it walks
 * every file, flags private-key/`.env`/credential filenames outright, and
 * content-scans everything else for high-confidence secret patterns. A
 * surviving mutant here — a filename pattern that stops matching, a content
 * regex missing a provider prefix, a size cap that lets a huge file skip
 * scanning instead of the reverse — is a real gap in the last line of
 * defense before a secret enters history.
 *
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
export default {
  packageManager: 'pnpm',
  plugins: ['@stryker-mutator/vitest-runner'],
  testRunner: 'vitest',
  vitest: {
    // NOT the root vitest.config.ts or packages/onboarding/test/**'s full
    // suite — see this file's header for why.
    configFile: 'config/mutation/vitest.onboarding-secret-guard.config.ts',
  },
  mutate: ['packages/onboarding/src/backup/secret-guard.ts'],
  concurrency: 1,
  symlinkNodeModules: false,
  coverageAnalysis: 'perTest',
  thresholds: { high: 100, low: 100, break: 100 },
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/onboarding-secret-guard/index.html' },
  jsonReporter: { fileName: 'reports/mutation/onboarding-secret-guard/mutation.json' },
  tempDirName: '.stryker-tmp-onboarding-secret-guard',
};
