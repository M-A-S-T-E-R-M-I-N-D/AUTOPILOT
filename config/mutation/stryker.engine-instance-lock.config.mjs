// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for packages/engine/src/adapters/instance-lock.ts
 * (backlog web-msnswvcq-viays2, "MUTATION TESTING") — next after clock.ts
 * (stryker.engine-clock.config.mjs) in `packages/engine/src/adapters/`.
 *
 * `FileInstanceLock` is the per-project single-instance guard that keeps two
 * flights from racing the same target repo (PARALLEL FLIGHTS 1/6,
 * docs/epics/0001-parallel-flights.md) — every acquire/release/staleness
 * decision it makes is safety-critical: a surviving mutant here (e.g. the
 * EEXIST check silently accepting any error, or `isLockStale`'s negation
 * flipped) could let two engines write the same target concurrently with no
 * visible failure.
 *
 * instance-lock.ts's only import is `node:fs`, so — like clock.ts before it
 * — this needs no `@autopilot/store` alias, no subprocess, no native
 * binding.
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
    configFile: 'config/mutation/vitest.engine-instance-lock.config.ts',
  },
  mutate: ['packages/engine/src/adapters/instance-lock.ts'],
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
  htmlReporter: { fileName: 'reports/mutation/engine-instance-lock/index.html' },
  jsonReporter: { fileName: 'reports/mutation/engine-instance-lock/mutation.json' },
  tempDirName: '.stryker-tmp-engine-instance-lock',
};
