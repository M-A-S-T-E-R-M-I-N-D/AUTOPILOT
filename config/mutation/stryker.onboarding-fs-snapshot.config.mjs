// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for packages/onboarding/src/adapters/fs-snapshot.ts
 * (backlog web-msnswvcq-viays2, "MUTATION TESTING") — seventeenth onboarding
 * module wired after adapters/fs-file-source.ts
 * (stryker.onboarding-fs-file-source.config.mjs).
 *
 * readFsSnapshot() is the impure edge gate detection reads through — the
 * real directory walk that becomes the pure {@link FsSnapshot} detectGate()
 * and the backlog/manifest detectors run against. A surviving mutant here
 * — e.g. `depth > maxDepth` flipped to `>=`/`<`, a dropped IGNORE_DIRS
 * check, `isDirectory`/`isFile` swapped, or the root-manifest content read
 * silently skipped — would mis-walk or mis-detect every flown repo's
 * ecosystem while the gate itself stays green.
 *
 * fs-snapshot.ts's only imports are `node:fs`/`node:path`, the pure
 * `makeFsSnapshot` (already wired, stryker.onboarding-snapshot.config.mjs),
 * and `IGNORE_DIRS` (already wired, stryker.onboarding-ignore.config.mjs) —
 * no better-sqlite3 anywhere on its import graph, so fs-snapshot.test.ts's
 * real-tmpdir fixtures never touch the sandbox gap documented in
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
    configFile: 'config/mutation/vitest.onboarding-fs-snapshot.config.ts',
  },
  mutate: ['packages/onboarding/src/adapters/fs-snapshot.ts'],
  concurrency: 1,
  symlinkNodeModules: false,
  coverageAnalysis: 'perTest',
  thresholds: { high: 100, low: 100, break: 100 },
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/onboarding-fs-snapshot/index.html' },
  jsonReporter: { fileName: 'reports/mutation/onboarding-fs-snapshot/mutation.json' },
  tempDirName: '.stryker-tmp-onboarding-fs-snapshot',
};
