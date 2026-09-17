// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for apps/dashboard/src/ask/service.ts (backlog
 * web-msnswvcq-viays2, "MUTATION TESTING") — next after browser.ts.
 * control/control.ts was explored and reverted (42 survivors + 4
 * no-coverage mutants — too large a unit for one firing); control/
 * fleet-watchdog.ts and control/flight-watchdog.ts were ruled out (both
 * import `openStore` from @autopilot/store directly, hitting the documented
 * better-sqlite3 sandbox-resolution gap, see stryker.store.config.mjs's
 * header). service.ts's only non-node import is `@autopilot/engine`
 * (buildAskPrompt and friends — pure prompt-building, no native binding);
 * see vitest.dashboard-ask.config.ts for why that still needed a
 * `resolve.alias` (the workspace symlink `symlinkNodeModules: false` never
 * recreates inside the sandbox).
 *
 * askProject/askProjectStream decide what grounds the model's answer to an
 * operator's question — the ASK M4 CHAT flow's only defense against an
 * ungrounded (hallucinated) answer. A surviving mutant here (MAX_SOURCES/
 * MAX_HISTORY_TURNS off-by-one, the view/live-state/map ordering swapped,
 * the empty-sources short-circuit skipped) could silently answer from the
 * wrong context or leak an unbounded prompt.
 *
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
export default {
  packageManager: 'pnpm',
  plugins: ['@stryker-mutator/vitest-runner'],
  testRunner: 'vitest',
  vitest: {
    // related: false — REQUIRED here, not a preference (2026-09-17). Stryker's
    // vitest runner defaults to vitest --related, asking vitest which test files
    // relate to the mutated one. Inside the sandbox (symlinkNodeModules: false,
    // needed for better-sqlite3) that relation cannot always be resolved, and the
    // runner then finds NOTHING: "No tests were executed. Stryker will exit
    // prematurely." This config crashed that way on every nightly — producing no
    // report at all, so the module looked accounted-for while being mutation-tested
    // not at all. Turning related off is safe precisely because the vitest config
    // below already scopes include to exactly the test file this module needs.
    related: false,
    // NOT the root vitest.config.ts — see this file's header for why.
    configFile: 'config/mutation/vitest.dashboard-ask.config.ts',
  },
  mutate: ['apps/dashboard/src/ask/service.ts'],
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
  // symlinkNodeModules: false — like every other config (2026-09-17, second
  // attempt). ask/service.ts reaches control-execute.ts through
  // architect-proposal.ts, and control-execute.ts imports openStore from
  // @autopilot/store at RUNTIME, so a sandbox with no node_modules cannot
  // load the test file and Stryker exits with "No tests were found" before
  // testing a single mutant — the way this config crashed on every nightly.
  // The first fix, `symlinkNodeModules: true`, ran on this Windows box and
  // STILL produced "No tests were found" on the Linux runners (two sweeps the
  // same day). The vitest config now resolves the store's source and its two
  // native modules by alias instead — no symlink on any OS; see its header.
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
  htmlReporter: { fileName: 'reports/mutation/dashboard-ask/index.html' },
  jsonReporter: { fileName: 'reports/mutation/dashboard-ask/mutation.json' },
  tempDirName: '.stryker-tmp-dashboard-ask',
};
