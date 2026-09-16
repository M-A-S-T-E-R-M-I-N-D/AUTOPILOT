// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for apps/dashboard/src/connection/service.ts (backlog
 * web-msnswvcq-viays2, "MUTATION TESTING") — next after connection/login.ts
 * (stryker.dashboard-login.config.mjs), continuing to widen through
 * connection/'s pure logic. service.ts is the last uncovered file in
 * connection/ — it composes config.ts, cli-probe.ts, and verify.ts (each
 * already covered standalone) into the connect-screen's status/apply/test
 * API.
 *
 * A surviving mutant here (the subscription "no stored login" honesty check
 * flipped, a credential wrongly reported present/absent, `ready` computed
 * from the wrong branch, or validateConnect accepting an empty/invalid
 * credential) could silently misreport connection state or let a bad
 * credential through.
 *
 * Same shape of good target as config.ts/verify.ts: only bare-specifier
 * workspace import is `@autopilot/engine`'s `describeAuth` (aliased in the
 * vitest config below straight to auth.ts, which has zero imports of its
 * own); the rest are relative imports that resolve fine in the sandbox.
 *
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
export default {
  packageManager: 'pnpm',
  plugins: ['@stryker-mutator/vitest-runner'],
  testRunner: 'vitest',
  vitest: {
    // NOT the root vitest.config.ts — see this file's header for why.
    configFile: 'config/mutation/vitest.dashboard-service.config.ts',
  },
  mutate: ['apps/dashboard/src/connection/service.ts'],
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
  htmlReporter: { fileName: 'reports/mutation/dashboard-service/index.html' },
  jsonReporter: { fileName: 'reports/mutation/dashboard-service/mutation.json' },
  tempDirName: '.stryker-tmp-dashboard-service',
};
