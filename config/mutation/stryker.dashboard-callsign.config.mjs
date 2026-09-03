// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for apps/dashboard/src/shared/callsign.ts (backlog
 * web-msnswvcq-viays2, "MUTATION TESTING") — next after fleet.ts
 * (stryker.dashboard-fleet.config.mjs), widening into the pure `shared/`
 * modules fleet.ts re-exports rather than fleet.ts itself.
 *
 * `firingCallsign` gives the operator a stable, human-referenceable name
 * for a firing ("AP-7 nova") derived from its id. A surviving mutant here
 * (the firing-number regex, the hash multiplier/mixing, the modulo index
 * into `CALLSIGN_WORDS`, an off-by-one in the word list) could mean two
 * different firings silently collide on the same callsign, or the number
 * embedded in it stops matching the firing it names — without any test
 * noticing.
 *
 * Same shape of good target as fleet.ts: zero imports (fully self-contained
 * — see the module's own file header) and its logic is exercised with
 * concrete expected-output assertions by fleet.test.ts's
 * `describe('firingCallsign', ...)` block, so it sidesteps the
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
    configFile: 'config/mutation/vitest.dashboard-callsign.config.ts',
  },
  mutate: ['apps/dashboard/src/shared/callsign.ts'],
  concurrency: 1,
  symlinkNodeModules: false,
  coverageAnalysis: 'perTest',
  thresholds: { high: 100, low: 100, break: 100 },
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/dashboard-callsign/index.html' },
  jsonReporter: { fileName: 'reports/mutation/dashboard-callsign/mutation.json' },
  tempDirName: '.stryker-tmp-dashboard-callsign',
};
