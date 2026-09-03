// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for apps/dashboard/src/shared/narrator.ts (backlog
 * web-msnswvcq-viays2, "MUTATION TESTING") — next after turns.ts
 * (stryker.dashboard-turns.config.mjs), continuing to widen into the
 * pure `shared/` modules `read/fleet.ts` re-exports.
 *
 * `narratorLine` (and its helpers `narratorKind`/`narratorPhrase`/
 * `narratorTarget`/`basename`) turn a firing's recent activity into the
 * deterministic, model-free one-sentence summary shown on the live worker
 * card. A surviving mutant here (a misclassified kind, a swapped phrase
 * template, a broken streak-collapsing condition, an off-by-one in the
 * truncation cap) could silently show the operator the wrong story about
 * what a firing is doing right now without any test noticing.
 *
 * Same shape of good target as turns.ts: zero imports (fully self-contained
 * — see the module's own file header) and its logic is exercised with
 * concrete expected-output assertions by fleet.test.ts's
 * `describe('narratorLine', ...)` block, so it sidesteps the
 * better-sqlite3-in-sandbox gap documented in stryker.store.config.mjs.
 *
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
export default {
  packageManager: 'pnpm',
  plugins: ['@stryker-mutator/vitest-runner'],
  testRunner: 'vitest',
  vitest: {
    // NOT the root vitest.config.ts — see this file's header for why.
    configFile: 'config/mutation/vitest.dashboard-narrator.config.ts',
  },
  mutate: ['apps/dashboard/src/shared/narrator.ts'],
  concurrency: 1,
  symlinkNodeModules: false,
  coverageAnalysis: 'perTest',
  thresholds: { high: 100, low: 100, break: 100 },
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/dashboard-narrator/index.html' },
  jsonReporter: { fileName: 'reports/mutation/dashboard-narrator/mutation.json' },
  tempDirName: '.stryker-tmp-dashboard-narrator',
};
