// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for packages/onboarding/src/adapters/fs-file-source.ts
 * (backlog web-msnswvcq-viays2, "MUTATION TESTING") — sixteenth onboarding
 * module wired after index/language.ts
 * (stryker.onboarding-language.config.mjs).
 *
 * FsFileSource is the real (impure) edge of onboarding's indexing pipeline —
 * the only FileSource walked against an actual directory. A surviving
 * mutant here — e.g. `depth > maxDepth` flipped to `>=`/`<`, `isDirectory`
 * swapped for `isFile`, a dropped IGNORE_DIRS check, or the POSIX path-join
 * losing its `sep` normalization — would silently mis-walk or mis-path every
 * flown repo's index while the gate itself stays green.
 *
 * fs-file-source.ts's only imports are `node:fs`/`node:path` and the pure
 * `IGNORE_DIRS` set (already wired, stryker.onboarding-ignore.config.mjs) —
 * no better-sqlite3 anywhere on its import graph, so
 * fs-file-source.test.ts's real-tmpdir fixtures never touch the sandbox gap
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
    configFile: 'config/mutation/vitest.onboarding-fs-file-source.config.ts',
  },
  mutate: ['packages/onboarding/src/adapters/fs-file-source.ts'],
  concurrency: 1,
  symlinkNodeModules: false,
  coverageAnalysis: 'perTest',
  thresholds: { high: 100, low: 100, break: 100 },
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/onboarding-fs-file-source/index.html' },
  jsonReporter: { fileName: 'reports/mutation/onboarding-fs-file-source/mutation.json' },
  tempDirName: '.stryker-tmp-onboarding-fs-file-source',
};
