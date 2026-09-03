// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for packages/onboarding/src/gate/detect.ts
 * (backlog web-msnswvcq-viays2, "MUTATION TESTING") — eleventh onboarding
 * module wired after manifests.ts (stryker.onboarding-manifests.config.mjs),
 * secret-guard.ts, guard.ts+refs.ts, size-guard.ts, ritual.ts, task-id.ts,
 * soul.ts, git-backup.ts, ignore.ts, and info.ts.
 *
 * detect.ts is the gate-detection entrypoint: it runs every registered
 * ecosystem detector, ranks the resulting candidates (score desc, ecosystem
 * id as a stable tiebreak), and derives the ambiguity ('none'/'single'/
 * 'multi') and confidence tier ('low'/'medium'/'high') the onboarding UI and
 * engine GatePort both read. A surviving mutant here — e.g. a flipped sort
 * comparator, a broken tierOf threshold, or a wrong ambiguity boundary —
 * would silently misrank or misclassify every detected stack while the gate
 * itself stays green.
 *
 * detect.ts has no filesystem/process imports — pure candidate-ranking logic
 * over an already-built FsSnapshot — so detect.test.ts never touches the
 * sandbox gap documented in stryker.store.config.mjs.
 *
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
export default {
  packageManager: 'pnpm',
  plugins: ['@stryker-mutator/vitest-runner'],
  testRunner: 'vitest',
  vitest: {
    // NOT the root vitest.config.ts — see this file's header for why.
    configFile: 'config/mutation/vitest.onboarding-detect.config.ts',
  },
  mutate: ['packages/onboarding/src/gate/detect.ts'],
  concurrency: 1,
  symlinkNodeModules: false,
  coverageAnalysis: 'perTest',
  thresholds: { high: 100, low: 100, break: 100 },
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/onboarding-detect/index.html' },
  jsonReporter: { fileName: 'reports/mutation/onboarding-detect/mutation.json' },
  tempDirName: '.stryker-tmp-onboarding-detect',
};
