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
    // related: false — REQUIRED here, not a preference (2026-09-17). Stryker's
    // vitest runner defaults to vitest --related, asking vitest which test files
    // relate to the mutated one. Inside the sandbox (symlinkNodeModules: false,
    // needed for better-sqlite3) that relation cannot always be resolved, and the
    // runner then finds NOTHING: "No tests were executed. Stryker will exit
    // prematurely." This config crashed that way on every nightly — producing no
    // report at all, so the module looked accounted-for while being mutation-tested
    // not at all. Turning related off is safe precisely because the vitest config
    // below already scopes include to exactly the test file this module needs.
    related: false,
    // NOT the root vitest.config.ts — see this file's header for why.
    configFile: 'config/mutation/vitest.dashboard-lock.config.ts',
  },
  mutate: ['apps/dashboard/src/flight/lock.ts'],
  // The sandbox is a COPY of the repo, and this repo carries 1.4GB of runtime
  // state (.autopilot: the live SQLite db plus every backup) that no test
  // reads. Copied once per config, on a 7200 RPM platter, across 103 configs.
  // Stryker documents ignorePatterns for exactly this: "too many (or too
  // large) files are copied to the sandbox that are not needed to run the
  // tests". .stryker-tmp* is listed too because a LEFTOVER sandbox otherwise
  // gets copied into the next one — 8.1GB was measured sitting in one.
  ignorePatterns: ['.autopilot', '.stryker-tmp*', 'reports', 'test-results', 'dist', '.git'],
  // cleanTempDir defaults to deleting only after a SUCCESSFUL run, so every
  // red config leaves its whole sandbox on disk forever. Most are red today.
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
  htmlReporter: { fileName: 'reports/mutation/dashboard-lock/index.html' },
  jsonReporter: { fileName: 'reports/mutation/dashboard-lock/mutation.json' },
  tempDirName: '.stryker-tmp-dashboard-lock',
};
