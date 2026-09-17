// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for
 * apps/dashboard/src/flight/deliverable-predicates.ts — the EXECUTABLE
 * DELIVERABLE predicates (the hard half of the DELIVERABLE verifier; the
 * soft half is covered by stryker.dashboard-deliverable.config.mjs).
 *
 * This module exists because of a survived-in-production false close (the
 * UNLOCK A specimen, RESEARCH-LIBRARY "Goodhart in the firing loop"): a
 * "complete" claim demanding "shell.ts under 300 lines" was accepted at
 * ~5,000 lines. A surviving mutant here (a comparator's strictness flipped,
 * the trailing-newline line-count correction dropped, the ambiguous-basename
 * failure loosened into a pass) would re-open exactly that hole — which is
 * why the thresholds stay at 100 like every other verifier module.
 *
 * Wiring Stryker here found four real gaps (dedupe first-wins was only
 * tested with identical payloads, the doubled-whitespace comparator path,
 * and the bare-name plausibility filter untested in the wc and exists
 * loops) and one equivalent mutant (countLines' endsWith needle — slicing a
 * trailing non-newline char never changes the line count; disabled inline
 * with the reasoning).
 *
 * Discovered and run by `pnpm run mutation`
 * (scripts/ci/run-all-mutation.mjs) — never chained into the fast gate.
 *
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
export default {
  packageManager: 'pnpm',
  plugins: ['@stryker-mutator/vitest-runner'],
  testRunner: 'vitest',
  vitest: {
    configFile: 'config/mutation/vitest.dashboard-deliverable-predicates.config.ts',
  },
  mutate: ['apps/dashboard/src/flight/deliverable-predicates.ts'],
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
  htmlReporter: { fileName: 'reports/mutation/dashboard-deliverable-predicates/index.html' },
  jsonReporter: { fileName: 'reports/mutation/dashboard-deliverable-predicates/mutation.json' },
  tempDirName: '.stryker-tmp-dashboard-deliverable-predicates',
};
