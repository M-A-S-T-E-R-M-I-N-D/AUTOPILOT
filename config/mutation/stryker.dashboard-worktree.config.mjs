// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for apps/dashboard/src/flight/worktree.ts (backlog
 * web-msnswvcq-viays2, "MUTATION TESTING") — next after gate-schedule.ts
 * (stryker.dashboard-gate-schedule.config.mjs), continuing to widen through
 * flight/'s other pure logic.
 *
 * worktree.ts's deriveWorktreePlan decides where a flight's linked worktree
 * lives and which branch it checks out — the containment guarantee (always a
 * SIBLING of target, never nested inside it) that
 * docs/epics/0004-bash-containment-worktree.md's Bash escape fix depends on.
 * A surviving mutant here (the wrong path segment, or a branch name losing
 * its uniqueness per projectId) could silently reopen the nested-worktree
 * escape hole or collide two flights' worktrees against the same target.
 *
 * Only import is `node:path` (a builtin, nothing to mock) and it's exercised
 * with concrete expected-output assertions by worktree.test.ts.
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
    configFile: 'config/mutation/vitest.dashboard-worktree.config.ts',
  },
  mutate: ['apps/dashboard/src/flight/worktree.ts'],
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
  htmlReporter: { fileName: 'reports/mutation/dashboard-worktree/index.html' },
  jsonReporter: { fileName: 'reports/mutation/dashboard-worktree/mutation.json' },
  tempDirName: '.stryker-tmp-dashboard-worktree',
};
