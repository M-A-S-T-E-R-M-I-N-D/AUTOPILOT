// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for packages/onboarding/src/backup/errors.ts (backlog
 * web-msnswvcq-viays2, "MUTATION TESTING") — nineteenth onboarding module
 * wired after onboard/backlog.ts (stryker.onboarding-backlog.config.mjs).
 *
 * RepoNotBackedUpError/PossibleSecretsDetectedError/HugeFileDetectedError
 * are the safety-guard errors the backup ritual throws before anything ever
 * touches an unbacked-up repo. The only existing coverage (guard.test.ts,
 * secret-guard.test.ts, size-guard.test.ts) asserts `toBeInstanceOf` and
 * never inspects `.message`/`.name` — so a surviving mutant here (a dropped
 * `.join(', ')` separator, a silently emptied message template, a wrong
 * `.name` assignment) would corrupt the operator-facing diagnosis of WHY a
 * flight aborted while every existing test stayed green.
 *
 * errors.ts has no imports at all — pure `Error` subclasses — so
 * errors.test.ts never touches the sandbox gap documented in
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
    configFile: 'config/mutation/vitest.onboarding-errors.config.ts',
  },
  mutate: ['packages/onboarding/src/backup/errors.ts'],
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
  htmlReporter: { fileName: 'reports/mutation/onboarding-errors/index.html' },
  jsonReporter: { fileName: 'reports/mutation/onboarding-errors/mutation.json' },
  tempDirName: '.stryker-tmp-onboarding-errors',
};
