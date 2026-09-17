// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for apps/dashboard/src/flight/triage-factors.ts (backlog
 * web-msnswvcq-viays2, "MUTATION TESTING") — widening one more self-contained
 * slice, same "zero imports, concrete expected-output assertions" shape
 * stryker.dashboard-triage.config.mjs and stryker.engine-pace.config.mjs
 * already proved.
 *
 * triage-factors.ts is the runaway-task guard under board triage (founder
 * directive, distilled from the $240 mutation-testing lesson in
 * docs/RESEARCH-LIBRARY.md): a task burning heavy budget across many firings
 * without ever completing gets demoted to the queue's tail for operator
 * review, deterministically — never left to the model's judgment. A
 * surviving mutant here (a flipped streak/spend comparison, an off-by-one in
 * the demotion threshold, a reset condition that never fires) would silently
 * let a real runaway keep floating to the top of triage — exactly the
 * failure mode this module exists to prevent.
 *
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
export default {
  packageManager: 'pnpm',
  plugins: ['@stryker-mutator/vitest-runner'],
  testRunner: 'vitest',
  vitest: {
    // NOT the root vitest.config.ts — see this file's header for why.
    configFile: 'config/mutation/vitest.dashboard-triage-factors.config.ts',
  },
  mutate: ['apps/dashboard/src/flight/triage-factors.ts'],
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
  htmlReporter: { fileName: 'reports/mutation/dashboard-triage-factors/index.html' },
  jsonReporter: { fileName: 'reports/mutation/dashboard-triage-factors/mutation.json' },
  tempDirName: '.stryker-tmp-dashboard-triage-factors',
};
