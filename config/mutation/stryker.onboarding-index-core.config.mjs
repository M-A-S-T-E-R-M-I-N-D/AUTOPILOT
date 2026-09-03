// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for packages/onboarding/src/index/core.ts
 * (backlog web-msnswvcq-viays2, "MUTATION TESTING") — fourteenth onboarding
 * module wired after gate/snapshot.ts (stryker.onboarding-snapshot.config.mjs).
 *
 * core.ts is the pure content-hash index core (M2; ENGINE-RESEARCH I3):
 * hashContent/makeEntry/treeHash/diffIndex/summarize/rankHotFiles/buildIndex.
 * A surviving mutant here — e.g. a flipped diffIndex bucket, a broken
 * topDirs/languages tie-break, or a wrong treeHash ordering — would silently
 * corrupt what the onboarding index reports as "changed since last scan"
 * while the gate itself stays green.
 *
 * core.ts has no filesystem/process imports — pure hashing/sorting logic —
 * so core.test.ts never touches the sandbox gap documented in
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
    configFile: 'config/mutation/vitest.onboarding-index-core.config.ts',
  },
  mutate: ['packages/onboarding/src/index/core.ts'],
  concurrency: 1,
  symlinkNodeModules: false,
  coverageAnalysis: 'perTest',
  thresholds: { high: 100, low: 100, break: 100 },
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/onboarding-index-core/index.html' },
  jsonReporter: { fileName: 'reports/mutation/onboarding-index-core/mutation.json' },
  tempDirName: '.stryker-tmp-onboarding-index-core',
};
