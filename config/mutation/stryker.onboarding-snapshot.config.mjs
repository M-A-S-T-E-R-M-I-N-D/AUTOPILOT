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
  concurrency: 1,
  symlinkNodeModules: false,
  coverageAnalysis: 'perTest',
  thresholds: { high: 100, low: 100, break: 100 },
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/onboarding-snapshot/index.html' },
  jsonReporter: { fileName: 'reports/mutation/onboarding-snapshot/mutation.json' },
  tempDirName: '.stryker-tmp-onboarding-snapshot',
};
