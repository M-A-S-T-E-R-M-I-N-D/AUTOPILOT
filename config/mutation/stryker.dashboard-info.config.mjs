// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for apps/dashboard/src/info.ts (backlog
 * web-msnswvcq-viays2, "MUTATION TESTING") — next after ritual-lock.ts
 * (stryker.dashboard-ritual-lock.config.mjs), continuing to widen through
 * the app's other zero-import pure logic.
 *
 * `dashboardInfo()` and its constants back `/api/health` and the dashboard's
 * own self-description; DASHBOARD_VERSION also gates the "workspace package
 * vs product release" distinction routes.test.ts relies on. A surviving
 * mutant (a blanked string, an emptied DASHBOARD_SCREENS array, an emptied
 * dashboardInfo() return object) could silently ship a broken identity
 * response without any test noticing.
 *
 * Same shape of good target as backlog.ts: zero imports (a fully
 * self-contained pure module) and exercised with concrete expected-output
 * assertions by info.test.ts — the full dashboardInfo() descriptor via
 * `toEqual`, the exact DASHBOARD_SCREENS array, DASHBOARD_VERSION pinned to
 * its literal, and PRODUCT_VERSION checked against a semver shape (not a
 * hardcoded literal, since it's bumped every release) plus distinctness from
 * DASHBOARD_VERSION.
 *
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
export default {
  packageManager: 'pnpm',
  plugins: ['@stryker-mutator/vitest-runner'],
  testRunner: 'vitest',
  vitest: {
    // NOT the root vitest.config.ts — see this file's header for why.
    configFile: 'config/mutation/vitest.dashboard-info.config.ts',
  },
  mutate: ['apps/dashboard/src/info.ts'],
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
  htmlReporter: { fileName: 'reports/mutation/dashboard-info/index.html' },
  jsonReporter: { fileName: 'reports/mutation/dashboard-info/mutation.json' },
  tempDirName: '.stryker-tmp-dashboard-info',
};
