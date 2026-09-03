// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for apps/dashboard/src/shared/live-firing.ts (backlog
 * web-msnswvcq-viays2, "MUTATION TESTING") — next after flight-summary.ts
 * (stryker.dashboard-flight-summary.config.mjs), continuing to widen into
 * the pure `shared/` modules `read/fleet.ts` re-exports.
 *
 * `liveSubagents`/`averageFiringDurationMs` resolve the live worker card's
 * orbiting-satellite roster and its elapsed-vs-average progress bar. A
 * surviving mutant here (a broken dedup, a wrong cap, a swapped fallback
 * label, a broken null-filter or off-by-one in the duration average) could
 * silently misrepresent what a firing is doing right now, or its expected
 * duration, without any test noticing.
 *
 * Same shape of good target as flight-summary.ts: zero imports (fully
 * self-contained — see the module's own file header) and its logic is
 * exercised with concrete expected-output assertions by fleet.test.ts's
 * `describe('liveSubagents', ...)` block plus `describe('liveFiring', ...)`'s
 * `avgFiringDurationMs` cases, so it sidesteps the better-sqlite3-in-sandbox
 * gap documented in stryker.store.config.mjs.
 *
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
export default {
  packageManager: 'pnpm',
  plugins: ['@stryker-mutator/vitest-runner'],
  testRunner: 'vitest',
  vitest: {
    // NOT the root vitest.config.ts — see this file's header for why.
    configFile: 'config/mutation/vitest.dashboard-live-firing.config.ts',
  },
  mutate: ['apps/dashboard/src/shared/live-firing.ts'],
  concurrency: 1,
  symlinkNodeModules: false,
  coverageAnalysis: 'perTest',
  thresholds: { high: 100, low: 100, break: 100 },
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/dashboard-live-firing/index.html' },
  jsonReporter: { fileName: 'reports/mutation/dashboard-live-firing/mutation.json' },
  tempDirName: '.stryker-tmp-dashboard-live-firing',
};
