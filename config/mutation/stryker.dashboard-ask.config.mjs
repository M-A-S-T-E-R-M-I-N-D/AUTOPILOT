// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for apps/dashboard/src/ask/service.ts (backlog
 * web-msnswvcq-viays2, "MUTATION TESTING") — next after browser.ts.
 * control/control.ts was explored and reverted (42 survivors + 4
 * no-coverage mutants — too large a unit for one firing); control/
 * fleet-watchdog.ts and control/flight-watchdog.ts were ruled out (both
 * import `openStore` from @autopilot/store directly, hitting the documented
 * better-sqlite3 sandbox-resolution gap, see stryker.store.config.mjs's
 * header). service.ts's only non-node import is `@autopilot/engine`
 * (buildAskPrompt and friends — pure prompt-building, no native binding);
 * see vitest.dashboard-ask.config.ts for why that still needed a
 * `resolve.alias` (the workspace symlink `symlinkNodeModules: false` never
 * recreates inside the sandbox).
 *
 * askProject/askProjectStream decide what grounds the model's answer to an
 * operator's question — the ASK M4 CHAT flow's only defense against an
 * ungrounded (hallucinated) answer. A surviving mutant here (MAX_SOURCES/
 * MAX_HISTORY_TURNS off-by-one, the view/live-state/map ordering swapped,
 * the empty-sources short-circuit skipped) could silently answer from the
 * wrong context or leak an unbounded prompt.
 *
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
export default {
  packageManager: 'pnpm',
  plugins: ['@stryker-mutator/vitest-runner'],
  testRunner: 'vitest',
  vitest: {
    // NOT the root vitest.config.ts — see this file's header for why.
    configFile: 'config/mutation/vitest.dashboard-ask.config.ts',
  },
  mutate: ['apps/dashboard/src/ask/service.ts'],
  concurrency: 1,
  symlinkNodeModules: false,
  coverageAnalysis: 'perTest',
  thresholds: { high: 100, low: 100, break: 100 },
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/dashboard-ask/index.html' },
  jsonReporter: { fileName: 'reports/mutation/dashboard-ask/mutation.json' },
  tempDirName: '.stryker-tmp-dashboard-ask',
};
