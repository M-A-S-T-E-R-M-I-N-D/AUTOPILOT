// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for apps/dashboard/src/flight/self-study.ts (backlog
 * web-msnswvcq-viays2, "MUTATION TESTING") — next after verify-by.ts
 * (stryker.dashboard-verify-by.config.mjs), continuing to widen through
 * flight/'s other zero-import pure logic.
 *
 * self-study.ts decides whether a flight should trigger the SELF-STUDY
 * paper's automated refresh (`selfStudyInvocation`, gated on firings > 0 so
 * a zero-firing flight never spams the evidence log) and whether the
 * post-flight commit ritual should run (`commitSelfStudyIfDirty`, gated on
 * `isDirty()` so a no-op regen never creates an empty commit). A surviving
 * mutant here (an inverted `<= 0` guard, a dropped `Math.max` clamp on the
 * shipped count, or a flipped `isDirty` check) could silently spawn the
 * generator on a no-evidence flight or skip committing real regen output.
 *
 * Same shape of good target as verify-by.ts: zero imports (a fully
 * self-contained pure module) and exercised with concrete expected-output
 * assertions by self-study.test.ts.
 *
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
export default {
  packageManager: 'pnpm',
  plugins: ['@stryker-mutator/vitest-runner'],
  testRunner: 'vitest',
  vitest: {
    // NOT the root vitest.config.ts — see this file's header for why.
    configFile: 'config/mutation/vitest.dashboard-self-study.config.ts',
  },
  mutate: ['apps/dashboard/src/flight/self-study.ts'],
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
  htmlReporter: { fileName: 'reports/mutation/dashboard-self-study/index.html' },
  jsonReporter: { fileName: 'reports/mutation/dashboard-self-study/mutation.json' },
  tempDirName: '.stryker-tmp-dashboard-self-study',
};
