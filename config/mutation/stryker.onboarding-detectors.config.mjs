// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for packages/onboarding/src/gate/detectors/{js,python,go,rust}.ts
 * (backlog web-msnswvcq-viays2, "MUTATION TESTING") — twelfth onboarding
 * module wired after detect.ts (stryker.onboarding-detect.config.mjs),
 * manifests.ts, secret-guard.ts, guard.ts+refs.ts, size-guard.ts, ritual.ts,
 * task-id.ts, soul.ts, git-backup.ts, ignore.ts, and info.ts.
 *
 * These are the four ecosystem detectors detect.ts ranks — jsDetector,
 * pythonDetector, goDetector, rustDetector — each reading an FsSnapshot and
 * proposing gate commands + an evidence trail + a score. A surviving mutant
 * here (a flipped `has`/`hasGlob` check, a dropped evidence push, a wrong
 * score arithmetic) would silently mis-detect a real repo's stack while
 * detect.ts's own ranking logic stays fully covered.
 *
 * No dedicated detector test file exists: detect.test.ts already drives
 * `detectGate` with its default (real, non-stub) detector list, so it
 * exercises these four files' branches directly — reused as-is via
 * vitest.onboarding-detectors.config.ts.
 *
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
export default {
  packageManager: 'pnpm',
  plugins: ['@stryker-mutator/vitest-runner'],
  testRunner: 'vitest',
  vitest: {
    // NOT the root vitest.config.ts — see this file's header for why.
    configFile: 'config/mutation/vitest.onboarding-detectors.config.ts',
  },
  mutate: [
    'packages/onboarding/src/gate/detectors/js.ts',
    'packages/onboarding/src/gate/detectors/python.ts',
    'packages/onboarding/src/gate/detectors/go.ts',
    'packages/onboarding/src/gate/detectors/rust.ts',
  ],
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
  htmlReporter: { fileName: 'reports/mutation/onboarding-detectors/index.html' },
  jsonReporter: { fileName: 'reports/mutation/onboarding-detectors/mutation.json' },
  tempDirName: '.stryker-tmp-onboarding-detectors',
};
