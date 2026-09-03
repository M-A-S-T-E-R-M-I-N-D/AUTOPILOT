// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for
 * apps/dashboard/src/flight/deliverable-predicates.ts — the EXECUTABLE
 * DELIVERABLE predicates (the hard half of the DELIVERABLE verifier; the
 * soft half is covered by stryker.dashboard-deliverable.config.mjs).
 *
 * This module exists because of a survived-in-production false close (the
 * UNLOCK A specimen, RESEARCH-LIBRARY "Goodhart in the firing loop"): a
 * "complete" claim demanding "shell.ts under 300 lines" was accepted at
 * ~5,000 lines. A surviving mutant here (a comparator's strictness flipped,
 * the trailing-newline line-count correction dropped, the ambiguous-basename
 * failure loosened into a pass) would re-open exactly that hole — which is
 * why the thresholds stay at 100 like every other verifier module.
 *
 * Wiring Stryker here found four real gaps (dedupe first-wins was only
 * tested with identical payloads, the doubled-whitespace comparator path,
 * and the bare-name plausibility filter untested in the wc and exists
 * loops) and one equivalent mutant (countLines' endsWith needle — slicing a
 * trailing non-newline char never changes the line count; disabled inline
 * with the reasoning).
 *
 * Discovered and run by `pnpm run mutation`
 * (scripts/ci/run-all-mutation.mjs) — never chained into the fast gate.
 *
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
export default {
  packageManager: 'pnpm',
  plugins: ['@stryker-mutator/vitest-runner'],
  testRunner: 'vitest',
  vitest: {
    configFile: 'config/mutation/vitest.dashboard-deliverable-predicates.config.ts',
  },
  mutate: ['apps/dashboard/src/flight/deliverable-predicates.ts'],
  concurrency: 1,
  symlinkNodeModules: false,
  coverageAnalysis: 'perTest',
  thresholds: { high: 100, low: 100, break: 100 },
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/dashboard-deliverable-predicates/index.html' },
  jsonReporter: { fileName: 'reports/mutation/dashboard-deliverable-predicates/mutation.json' },
  tempDirName: '.stryker-tmp-dashboard-deliverable-predicates',
};
