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
  // The sandbox is a COPY of the repo, and this repo carries ~1.4GB of runtime
  // state (.autopilot: the live SQLite db and every backup) that no test reads,
  // copied once PER CONFIG on a 7200 RPM platter across 103 configs. Stryker
  // documents ignorePatterns for exactly this case: "too many (or too large)
  // files are copied to the sandbox that are not needed to run the tests".
  // .stryker-tmp* is listed because a leftover sandbox otherwise gets copied
  // into the next one — 8.1GB was measured sitting in a single leftover
  // (2026-09-17). Measured effect on one config: startup 75s -> 17s.
  ignorePatterns: ['.autopilot', '.stryker-tmp*', 'reports', 'test-results', 'dist'],
  // cleanTempDir defaults to deleting the sandbox only after a SUCCESSFUL run,
  // so every red config leaves its entire sandbox on disk indefinitely — and
  // most are red while this debt is being cleared.
  cleanTempDir: 'always',
  concurrency: 1,
  symlinkNodeModules: false,
  coverageAnalysis: 'perTest',
  // Static mutants are out of scope (2026-09-16). Stryker's own term for a
  // mutant "only executed during the loading of a file": a module-level
  // constant is built once at import, BEFORE a mutant can be activated for a
  // given test, so no test can kill one and writing more would not change
  // that. They are an artifact of WHERE the code runs, not evidence of an
  // untested invariant — the store config's own comment works the case
  // through in full. Mutants inside functions that tests call are unaffected,
  // including functions the module also calls at load time.
  ignoreStatic: true,
  thresholds: { high: 100, low: 100, break: 100 },
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/onboarding-git-backup/index.html' },
  jsonReporter: { fileName: 'reports/mutation/onboarding-git-backup/mutation.json' },
  tempDirName: '.stryker-tmp-onboarding-git-backup',
};
