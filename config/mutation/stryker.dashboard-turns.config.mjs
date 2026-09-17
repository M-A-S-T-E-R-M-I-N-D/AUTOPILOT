// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for apps/dashboard/src/shared/turns.ts (backlog
 * web-msnswvcq-viays2, "MUTATION TESTING") — next after callsign.ts
 * (stryker.dashboard-callsign.config.mjs), continuing to widen into the
 * pure `shared/` modules `read/fleet.ts` re-exports.
 *
 * `countTurns` approximates the number of assistant turns behind a run of
 * activity rows by collapsing consecutive rows that share the same
 * model/tokensIn/tokensOut/reasoning tuple. A surviving mutant here (the key
 * comparison, the collapsing condition, the increment, or the tuple fields
 * themselves) could silently mis-report a firing's turn count on the live
 * worker card without any test noticing.
 *
 * Same shape of good target as callsign.ts: zero imports (fully
 * self-contained — see the module's own file header) and its logic is
 * exercised with concrete expected-output assertions by fleet.test.ts's
 * `describe('countTurns', ...)` block, so it sidesteps the
 * better-sqlite3-in-sandbox gap documented in stryker.store.config.mjs.
 *
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
export default {
  packageManager: 'pnpm',
  plugins: ['@stryker-mutator/vitest-runner'],
  testRunner: 'vitest',
  vitest: {
    // NOT the root vitest.config.ts — see this file's header for why.
    configFile: 'config/mutation/vitest.dashboard-turns.config.ts',
  },
  mutate: ['apps/dashboard/src/shared/turns.ts'],
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
  htmlReporter: { fileName: 'reports/mutation/dashboard-turns/index.html' },
  jsonReporter: { fileName: 'reports/mutation/dashboard-turns/mutation.json' },
  tempDirName: '.stryker-tmp-dashboard-turns',
};
