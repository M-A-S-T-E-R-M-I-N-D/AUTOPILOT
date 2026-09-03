// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for apps/dashboard/src/control/state.ts (backlog
 * web-msnswvcq-viays2, "MUTATION TESTING") — next after
 * flight/spawn-flight.ts. state.ts's only import is a type-only one
 * (`DashboardState`/`RunState` from `./types.js`, erased at compile time),
 * so nothing native ever needs to load inside Stryker's sandbox.
 *
 * parseState is the defensive record parser guarding process.kill callers:
 * it rejects pid 0 / negative (special to `process.kill`, meaning "whole
 * process group") before a stale/malformed run-state file can ever reach a
 * signal call. A surviving mutant here (the `pid > 0` guard flipped or
 * dropped, `Number.isInteger` swapped for a looser check) could silently
 * reopen a wrong-process/process-group kill.
 *
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
export default {
  packageManager: 'pnpm',
  plugins: ['@stryker-mutator/vitest-runner'],
  testRunner: 'vitest',
  vitest: {
    // NOT the root vitest.config.ts — see this file's header for why.
    configFile: 'config/mutation/vitest.dashboard-state.config.ts',
  },
  mutate: ['apps/dashboard/src/control/state.ts'],
  concurrency: 1,
  symlinkNodeModules: false,
  coverageAnalysis: 'perTest',
  thresholds: { high: 100, low: 100, break: 100 },
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/dashboard-state/index.html' },
  jsonReporter: { fileName: 'reports/mutation/dashboard-state/mutation.json' },
  tempDirName: '.stryker-tmp-dashboard-state',
};
