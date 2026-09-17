// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for packages/engine/src/adapters/clock.ts (backlog
 * web-msnswvcq-viays2, "MUTATION TESTING") — the twenty-second module wired,
 * second from `packages/engine/src/adapters/` after remediating-gate.ts
 * (stryker.engine-remediating-gate.config.mjs).
 *
 * `SystemClock` is the real-clock `ClockPort` implementation injected
 * everywhere the engine needs "now" (firing timestamps, pacer windows,
 * telemetry rows) so the rest of the engine can stay deterministic under
 * fakes. It had NO dedicated test file before this change — only indirect
 * exercise via `packages/engine/test/e2e/sandbox.test.ts` — despite feeding
 * every un-fakeable timestamp the engine records. A surviving mutant here
 * (e.g. `Math.floor` dropped from `nowEpochSec`, or `/ 1000` flipped to
 * `* 1000`) could silently corrupt every epoch-second value the engine
 * persists.
 *
 * clock.ts's only import is `../ports.js`, `import type` and erased at
 * compile time, so — like remediating-gate.ts before it — this needs no
 * `@autopilot/store` alias, no subprocess, no native binding.
 *
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
export default {
  packageManager: 'pnpm',
  plugins: ['@stryker-mutator/vitest-runner'],
  testRunner: 'vitest',
  vitest: {
    // NOT the root vitest.config.ts or packages/engine/test/**'s full suite
    // — see this file's header for why.
    configFile: 'config/mutation/vitest.engine-clock.config.ts',
  },
  mutate: ['packages/engine/src/adapters/clock.ts'],
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
  htmlReporter: { fileName: 'reports/mutation/engine-clock/index.html' },
  jsonReporter: { fileName: 'reports/mutation/engine-clock/mutation.json' },
  tempDirName: '.stryker-tmp-engine-clock',
};
