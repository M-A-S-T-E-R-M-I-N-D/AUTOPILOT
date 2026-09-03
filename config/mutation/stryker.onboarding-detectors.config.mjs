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
  concurrency: 1,
  symlinkNodeModules: false,
  coverageAnalysis: 'perTest',
  thresholds: { high: 100, low: 100, break: 100 },
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/onboarding-detectors/index.html' },
  jsonReporter: { fileName: 'reports/mutation/onboarding-detectors/mutation.json' },
  tempDirName: '.stryker-tmp-onboarding-detectors',
};
