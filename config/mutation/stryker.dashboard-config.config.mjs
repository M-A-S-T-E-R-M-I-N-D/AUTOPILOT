// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for apps/dashboard/src/read/config.ts (backlog
 * web-msnswvcq-viays2, "MUTATION TESTING") — next after flightlog.ts
 * (stryker.dashboard-flightlog.config.mjs) in apps/dashboard/src/read/.
 *
 * `resolveDbPath` decides which on-disk file every dashboard entrypoint
 * (cli.ts, demo.ts, flight.ts, fly.ts, reset.ts, restore.ts, server/main.ts)
 * opens as the store. Before this file, it was exercised only indirectly
 * through source.test.ts (which never covers the empty-string override
 * branch). Wiring Stryker here also caught genuinely dead logic: the
 * original `override && override.length > 0` guard was equivalent to a
 * plain truthiness check for the `string | undefined` type it guards
 * (a non-empty string is never falsy), so no test could ever kill a mutant
 * on the redundant `.length > 0` half — it's been simplified away. A
 * surviving mutant here now (e.g. the join() argument order/literal
 * changed) could point every command at the wrong database without anyone
 * noticing.
 *
 * Same shape of good target flightlog.ts was: config.ts imports only
 * `node:path` (no `@autopilot/store`, no runtime better-sqlite3 load) and
 * its test file imports nothing but vitest and config.js, so it sidesteps
 * the sqlite sandbox-copy gap documented in stryker.store.config.mjs and the
 * jsdom environment the rest of apps/dashboard/test/web needs.
 *
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
export default {
  packageManager: 'pnpm',
  plugins: ['@stryker-mutator/vitest-runner'],
  testRunner: 'vitest',
  vitest: {
    // NOT the root vitest.config.ts — see this file's header for why.
    configFile: 'config/mutation/vitest.dashboard-config.config.ts',
  },
  mutate: ['apps/dashboard/src/read/config.ts'],
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
  htmlReporter: { fileName: 'reports/mutation/dashboard-config/index.html' },
  jsonReporter: { fileName: 'reports/mutation/dashboard-config/mutation.json' },
  tempDirName: '.stryker-tmp-dashboard-config',
};
