// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for apps/dashboard/src/flight/registry.ts (backlog
 * web-msnswvcq-viays2, "MUTATION TESTING") — next after info.ts
 * (stryker.dashboard-info.config.mjs), continuing to widen through
 * flight/'s other zero-import pure logic.
 *
 * FlightRunnerRegistry is what makes PARALLEL FLIGHTS work: one FlightRunner
 * per (resolved) folder instead of a dashboard-wide singleton, plus the
 * shared-quota fairness queue that caps how many folders may run at once and
 * drains FIFO as slots free up. A surviving mutant here (a folder-resolution
 * bug that lets two different folders collide, a queue that starts the wrong
 * folder, a dropped cap check, or a stop() that misses the SAME-folder
 * runner) could silently let two flights stomp on one shared project, or let
 * concurrency exceed the operator's spend cap.
 *
 * Same shape of good target as runner.ts: zero imports of anything with a
 * side effect — the only import is the sibling FlightRunner class, itself
 * fully deps-injected — and exercised with concrete expected-output
 * assertions by registry.test.ts.
 *
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
export default {
  packageManager: 'pnpm',
  plugins: ['@stryker-mutator/vitest-runner'],
  testRunner: 'vitest',
  vitest: {
    // NOT the root vitest.config.ts — see this file's header for why.
    configFile: 'config/mutation/vitest.dashboard-registry.config.ts',
  },
  mutate: ['apps/dashboard/src/flight/registry.ts'],
  concurrency: 1,
  symlinkNodeModules: false,
  coverageAnalysis: 'perTest',
  thresholds: { high: 100, low: 100, break: 100 },
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/dashboard-registry/index.html' },
  jsonReporter: { fileName: 'reports/mutation/dashboard-registry/mutation.json' },
  tempDirName: '.stryker-tmp-dashboard-registry',
};
