// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for apps/dashboard/src/read/reconcile.ts (backlog
 * web-msnswvcq-viays2, "MUTATION TESTING") — next after config.ts
 * (stryker.dashboard-config.config.mjs) in apps/dashboard/src/read/.
 *
 * `titleMatchScore`, `filePathMatchesTitle`, and `findReconciliationCandidates`
 * decide whether a shipped commit gets proposed to auto-close an open board
 * task ("Board hygiene", BACKLOG-999). A surviving mutant here — a loosened
 * Jaccard boundary, a flipped `score < threshold` comparison, the `done`-task
 * skip removed, or the strongest-match tie-break dropped — could mean a task
 * is proposed done on a spurious match, or a genuinely shipped task never
 * gets surfaced at all.
 *
 * Same shape of good target config.ts was: reconcile.ts imports only a type
 * (`TaskEntry` from fleet.js, erased at compile time — no runtime
 * `@autopilot/store` or better-sqlite3 load) and its test file imports
 * nothing but vitest and reconcile.js, so it sidesteps the sqlite
 * sandbox-copy gap documented in stryker.store.config.mjs and the jsdom
 * environment the rest of apps/dashboard/test/web needs.
 *
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
export default {
  packageManager: 'pnpm',
  plugins: ['@stryker-mutator/vitest-runner'],
  testRunner: 'vitest',
  vitest: {
    // NOT the root vitest.config.ts — see this file's header for why.
    configFile: 'config/mutation/vitest.dashboard-reconcile.config.ts',
  },
  mutate: ['apps/dashboard/src/read/reconcile.ts'],
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
  htmlReporter: { fileName: 'reports/mutation/dashboard-reconcile/index.html' },
  jsonReporter: { fileName: 'reports/mutation/dashboard-reconcile/mutation.json' },
  tempDirName: '.stryker-tmp-dashboard-reconcile',
};
