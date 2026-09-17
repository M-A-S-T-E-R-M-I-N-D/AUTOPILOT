// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for apps/dashboard/src/read/anomalies.ts (backlog
 * web-msnswvcq-viays2, "MUTATION TESTING") — the first slice to widen
 * coverage into apps/dashboard, previously wired only across packages/store
 * (rank.ts, schema.ts) and packages/engine (see stryker.engine-*.config.mjs).
 *
 * anomalies.ts is the same shape of good target pace.ts/release.ts were: it
 * imports only a type from ./fleet.js (no @autopilot/store, no
 * better-sqlite3, no DOM), and its test file imports nothing but vitest and
 * anomalies.js — so it sidesteps both the sqlite-sandbox gap documented in
 * stryker.store.config.mjs (apps/dashboard's read models that DO open a real
 * store hit the identical `@autopilot/store` sandbox-copy problem and remain
 * out of scope) and the jsdom environment the rest of apps/dashboard/test/web
 * needs.
 *
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
export default {
  packageManager: 'pnpm',
  plugins: ['@stryker-mutator/vitest-runner'],
  testRunner: 'vitest',
  vitest: {
    // NOT the root vitest.config.ts — see this file's header for why.
    configFile: 'config/mutation/vitest.dashboard-anomalies.config.ts',
  },
  mutate: ['apps/dashboard/src/read/anomalies.ts'],
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
  htmlReporter: { fileName: 'reports/mutation/dashboard-anomalies/index.html' },
  jsonReporter: { fileName: 'reports/mutation/dashboard-anomalies/mutation.json' },
  tempDirName: '.stryker-tmp-dashboard-anomalies',
};
