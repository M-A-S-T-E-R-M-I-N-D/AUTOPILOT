// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for packages/onboarding/src/index/language.ts
 * (backlog web-msnswvcq-viays2, "MUTATION TESTING") — fifteenth onboarding
 * module wired after gate/snapshot.ts and index/core.ts
 * (stryker.onboarding-index-core.config.mjs).
 *
 * detectLanguage() maps a file's extension to the Language enum core.ts
 * stamps onto every index entry (M2; ENGINE-RESEARCH I3) — the value the
 * dashboard's language breakdown and hot-file lists are built from. A
 * surviving mutant here — e.g. a dropped EXTENSION_MAP entry, a missing
 * `.toLowerCase()`, or `indexOf` swapped in for `lastIndexOf` — would
 * silently mis-classify files while the gate itself stays green.
 *
 * language.ts has no filesystem/process imports — a lookup table and a
 * string search — so language.test.ts never touches the sandbox gap
 * documented in stryker.store.config.mjs.
 *
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
export default {
  packageManager: 'pnpm',
  plugins: ['@stryker-mutator/vitest-runner'],
  testRunner: 'vitest',
  vitest: {
    // NOT the root vitest.config.ts — see this file's header for why.
    configFile: 'config/mutation/vitest.onboarding-language.config.ts',
  },
  mutate: ['packages/onboarding/src/index/language.ts'],
  concurrency: 1,
  symlinkNodeModules: false,
  coverageAnalysis: 'perTest',
  thresholds: { high: 100, low: 100, break: 100 },
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/onboarding-language/index.html' },
  jsonReporter: { fileName: 'reports/mutation/onboarding-language/mutation.json' },
  tempDirName: '.stryker-tmp-onboarding-language',
};
