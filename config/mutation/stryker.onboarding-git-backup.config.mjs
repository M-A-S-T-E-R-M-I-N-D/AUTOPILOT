// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for packages/onboarding/src/adapters/git-backup.ts
 * (backlog web-msnswvcq-viays2, "MUTATION TESTING") — seventh onboarding
 * module wired after secret-guard.ts, guard.ts+refs.ts, size-guard.ts,
 * ritual.ts, task-id.ts, and soul.ts (stryker.onboarding-soul.config.mjs).
 *
 * GitBackup is the concrete `BackupVcs` the folder-lock ritual runs against
 * every real repo — every write it issues is additive (init/commit/tag/
 * branch/checkout), never `reset --hard`, force-push, or a history rewrite.
 * `commitAll` also runs {@link scanForSecrets}/{@link scanForHugeFiles}
 * before `git add -A`, the last line of defense before an unreviewed
 * onboarding target's stray secret or oversized blob lands in permanent,
 * additive-only history. A surviving mutant here (an exit-code check
 * flipped so a failed git op reads as success, the secret/huge-file guard
 * silently skipped, or the self-supplied commit identity dropped so
 * `commitAll` fails on a repo with no configured git user) would mean the
 * ritual either lies about a failed backup or lets exactly the file the
 * guard exists to stop slip into the baseline commit.
 *
 * git-backup.ts's only runtime imports are `node:child_process` (mocked by
 * the test) and the already-100%-covered secret-guard.ts/size-guard.ts —
 * neither reaches better-sqlite3 or `@autopilot/store`. git-backup.test.ts
 * drives it entirely through a mocked `execFile` plus disposable tmpdir
 * fixtures, so it never touches the sandbox gap documented in
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
    configFile: 'config/mutation/vitest.onboarding-git-backup.config.ts',
  },
  mutate: ['packages/onboarding/src/adapters/git-backup.ts'],
  concurrency: 1,
  symlinkNodeModules: false,
  coverageAnalysis: 'perTest',
  thresholds: { high: 100, low: 100, break: 100 },
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/onboarding-git-backup/index.html' },
  jsonReporter: { fileName: 'reports/mutation/onboarding-git-backup/mutation.json' },
  tempDirName: '.stryker-tmp-onboarding-git-backup',
};
