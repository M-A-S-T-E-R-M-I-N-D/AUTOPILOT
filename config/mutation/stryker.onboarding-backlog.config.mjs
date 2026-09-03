// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for packages/onboarding/src/onboard/backlog.ts (backlog
 * web-msnswvcq-viays2, "MUTATION TESTING") — eighteenth onboarding module
 * wired after adapters/fs-snapshot.ts (stryker.onboarding-fs-snapshot.config.mjs).
 *
 * detectBacklogPath()/parseSoulBacklogPath() are the heuristics that
 * generalize AUTOPILOT's own hardcoded `docs/BACKLOG-999.md` convention into
 * one any flown project can use. A surviving mutant here — e.g. the
 * shallowest-then-lexical tie-break flipped, the `BACKLOG_BASENAME_RE`/
 * `SOUL_BACKLOG_RE` regexes silently loosened, or an empty-after-trim
 * `Backlog:` value treated as a real path — would misdetect a target
 * repo's backlog file (or its SOUL override) while onboarding stays green.
 *
 * backlog.ts's only import is the `FsSnapshot` type — no `node:fs`, no
 * better-sqlite3 anywhere on its import graph — so backlog.test.ts's
 * `makeFsSnapshot`-built fixtures never touch the sandbox gap documented in
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
    configFile: 'config/mutation/vitest.onboarding-backlog.config.ts',
  },
  mutate: ['packages/onboarding/src/onboard/backlog.ts'],
  concurrency: 1,
  symlinkNodeModules: false,
  coverageAnalysis: 'perTest',
  thresholds: { high: 100, low: 100, break: 100 },
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/onboarding-backlog/index.html' },
  jsonReporter: { fileName: 'reports/mutation/onboarding-backlog/mutation.json' },
  tempDirName: '.stryker-tmp-onboarding-backlog',
};
