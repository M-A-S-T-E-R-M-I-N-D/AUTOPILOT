// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for apps/dashboard/src/read/fleet.ts (backlog
 * web-msnswvcq-viays2, "MUTATION TESTING") — next after reconcile.ts
 * (stryker.dashboard-reconcile.config.mjs) in apps/dashboard/src/read/.
 *
 * fleet.ts is the Fleet read-model: pure transforms from per-project
 * aggregates to the view model the dashboard renders (`buildFleetView`,
 * `toCard`, `activityPhase`, `fleetStreak`, `firstFailedGateCheck`,
 * `wasAutoformatRescued`, and more). A surviving mutant here — a flipped
 * comparison in a gate-check classifier, a dropped severity threshold, an
 * off-by-one in streak counting, a swapped boolean in the rescue-detection
 * logic — could mean the dashboard shows the wrong health signal to the
 * operator without ever failing a test.
 *
 * Same shape of good target as reconcile.ts: fleet.ts imports only types
 * from `@autopilot/store` (erased at compile time) plus other pure local
 * modules — no runtime `@autopilot/store` or better-sqlite3 load — and its
 * test file imports nothing but vitest and fleet.js, so it sidesteps the
 * sqlite sandbox-copy gap documented in stryker.store.config.mjs and the
 * jsdom environment the rest of apps/dashboard/test/web needs.
 *
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
export default {
  packageManager: 'pnpm',
  plugins: ['@stryker-mutator/vitest-runner'],
  testRunner: 'vitest',
  vitest: {
    // NOT the root vitest.config.ts — see this file's header for why.
    configFile: 'config/mutation/vitest.dashboard-fleet.config.ts',
  },
  mutate: ['apps/dashboard/src/read/fleet.ts'],
  concurrency: 1,
  symlinkNodeModules: false,
  coverageAnalysis: 'perTest',
  thresholds: { high: 100, low: 100, break: 100 },
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/dashboard-fleet/index.html' },
  jsonReporter: { fileName: 'reports/mutation/dashboard-fleet/mutation.json' },
  tempDirName: '.stryker-tmp-dashboard-fleet',
};
