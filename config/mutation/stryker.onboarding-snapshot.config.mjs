// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for packages/onboarding/src/gate/snapshot.ts
 * (backlog web-msnswvcq-viays2, "MUTATION TESTING") — thirteenth onboarding
 * module wired after detect.ts, and gate/detectors/*.ts
 * (stryker.onboarding-detectors.config.mjs).
 *
 * snapshot.ts defines the FsSnapshot purity boundary every gate detector
 * consumes (`has`/`hasSuffix`/`hasGlob`/`read`) and the pure `makeFsSnapshot`
 * factory that builds one from plain data. A surviving mutant here — e.g. a
 * flipped glob-to-regex escape, a broken suffix `.some()` predicate, or a
 * wrong `read()` fallback — would silently corrupt what every detector sees
 * as "present in the repo" while the gate itself stays green.
 *
 * snapshot.ts has no filesystem/process imports — pure string/glob logic —
 * so snapshot.test.ts never touches the sandbox gap documented in
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
    configFile: 'config/mutation/vitest.onboarding-snapshot.config.ts',
  },
  mutate: ['packages/onboarding/src/gate/snapshot.ts'],
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
  htmlReporter: { fileName: 'reports/mutation/onboarding-snapshot/index.html' },
  jsonReporter: { fileName: 'reports/mutation/onboarding-snapshot/mutation.json' },
  tempDirName: '.stryker-tmp-onboarding-snapshot',
};
