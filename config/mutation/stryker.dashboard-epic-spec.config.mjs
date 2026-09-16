// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for apps/dashboard/src/flight/epic-spec.ts (backlog
 * web-msnswvcq-viays2, "MUTATION TESTING") — next after completion.ts
 * (stryker.dashboard-completion.config.mjs), continuing to widen through
 * flight/'s other zero-import pure logic.
 *
 * `extractEpicSpec` pulls the trailing `EPIC-SPEC: <path>` clause off a
 * board task's title. `fly.ts`'s `markTaskDoneIfShipped` uses it, alongside
 * `GitVcs.fileExists`, to prove an epic-sized task's linked spec file was
 * actually committed before trusting a `"completion":"complete"` claim. A
 * surviving mutant here (e.g. a flipped `> 0` or a wrong slice offset) could
 * silently misread the marker and let an unwritten spec pass as proof.
 *
 * Same shape of good target as completion.ts: zero imports (a fully
 * self-contained pure module — see the module's own file header) and
 * already exercised with concrete expected-output assertions by
 * epic-spec.test.ts covering the found, not-found, and blank-path cases, so
 * it sidesteps the better-sqlite3-in-sandbox gap documented in
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
    configFile: 'config/mutation/vitest.dashboard-epic-spec.config.ts',
  },
  mutate: ['apps/dashboard/src/flight/epic-spec.ts'],
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
  htmlReporter: { fileName: 'reports/mutation/dashboard-epic-spec/index.html' },
  jsonReporter: { fileName: 'reports/mutation/dashboard-epic-spec/mutation.json' },
  tempDirName: '.stryker-tmp-dashboard-epic-spec',
};
