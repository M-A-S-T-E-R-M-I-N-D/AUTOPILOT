// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for apps/dashboard/src/gate-commands.ts (backlog
 * web-msnswvcq-viays2, "MUTATION TESTING") — continuing to widen through
 * apps/dashboard/src's zero-side-effect pure logic.
 *
 * gateCommands() is the ONE place a project's flat GateSpec becomes a
 * runnable command list — both a live flight (fly.ts) and a LANDING
 * EXECUTE (landing/execute.ts) gate through it, so the two paths can't
 * drift apart (epic 0002 "shell decomposition", slice 1). A surviving
 * mutant here (a dropped gate kind, the typecheck/lint/format parallel set
 * widened or narrowed, the args array aliased instead of copied so a
 * caller's mutation leaks into the command list, or a bin-presence check
 * inverted so an unconfigured kind still runs) could silently skip a real
 * gate check or corrupt the shared command list across concurrent flights.
 *
 * gate-commands.ts's only import is a type (`GateSpec`, erased at compile
 * time) — zero runtime imports, same low-risk shape as registry.ts/
 * runner.ts, never touches the better-sqlite3-in-sandbox gap documented in
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
    configFile: 'config/mutation/vitest.dashboard-gate-commands.config.ts',
  },
  mutate: ['apps/dashboard/src/gate-commands.ts'],
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
  htmlReporter: { fileName: 'reports/mutation/dashboard-gate-commands/index.html' },
  jsonReporter: { fileName: 'reports/mutation/dashboard-gate-commands/mutation.json' },
  tempDirName: '.stryker-tmp-dashboard-gate-commands',
};
