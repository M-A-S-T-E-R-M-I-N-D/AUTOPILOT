// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for apps/dashboard/src/flight/spawn-flight.ts (backlog
 * web-msnswvcq-viays2, "MUTATION TESTING") — next after inbox-triage.ts was
 * ruled out (it imports `createTask` from `@autopilot/store` as a real
 * value, not a type, so it hits the same documented better-sqlite3
 * sandbox-resolution gap as packages/store's own widening — see
 * stryker.store.config.mjs's header). spawn-flight.ts's only imports are
 * `node:child_process`, `node:fs`, and `node:path`; its test mocks
 * `node:child_process` entirely (same pattern as connection/login.test.ts),
 * so nothing native ever needs to load inside Stryker's sandbox.
 *
 * createSpawnFlight decides HOW a flight's detached child process is
 * spawned — the FLIGHT PROCESS DECOUPLING fix (web-msp5g6lw-cvmr8n) that
 * keeps a quota-spending flight alive across a dashboard server
 * crash/restart. A surviving mutant here (`detached` silently flipped,
 * `AUTOPILOT_FLIGHT=1` dropped from env, the wrong argv order) could
 * silently reopen the "server restart kills the flight it launched" bug.
 *
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
export default {
  packageManager: 'pnpm',
  plugins: ['@stryker-mutator/vitest-runner'],
  testRunner: 'vitest',
  vitest: {
    // NOT the root vitest.config.ts — see this file's header for why.
    configFile: 'config/mutation/vitest.dashboard-spawn-flight.config.ts',
  },
  mutate: ['apps/dashboard/src/flight/spawn-flight.ts'],
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
  htmlReporter: { fileName: 'reports/mutation/dashboard-spawn-flight/index.html' },
  jsonReporter: { fileName: 'reports/mutation/dashboard-spawn-flight/mutation.json' },
  tempDirName: '.stryker-tmp-dashboard-spawn-flight',
};
