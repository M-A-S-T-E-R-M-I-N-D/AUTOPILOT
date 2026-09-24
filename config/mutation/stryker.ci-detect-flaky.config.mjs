// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for scripts/ci/detect-flaky.mjs (board web-mubnvtwz-c8fgih,
 * "Mutation coverage stops at the src boundary") — the FOURTH config to
 * mutate anything under scripts/ci/, following
 * stryker.ci-run-all-mutation.config.mjs, stryker.ci-validate-spdx-headers.config.mjs
 * and stryker.ci-check-conflict-markers.config.mjs. Only `summarizeRuns` and
 * `formatVerdict` are mutated; `pnpmInvocation`, `runOnce` and `main` carry a
 * `// Stryker disable all` comment in the source since they spawn `vitest run`
 * via `pnpm` and read argv/fs, the same stance the other three ci/ configs
 * take for their own impure glue.
 *
 * A surviving mutant here would let the flaky/stable tally or its printed
 * verdict silently misreport a suspected flaky test file — the exact
 * diagnostic detect-flaky.mjs exists to give an operator before filing a
 * `config/quarantine/flaky-tests.json` entry.
 *
 * Same shape of good target as stryker.ci-check-conflict-markers.config.mjs:
 * effectively zero imports (only Node built-ins) and exercised with concrete
 * expected-output assertions by detect-flaky.test.ts.
 *
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
export default {
  packageManager: 'pnpm',
  plugins: ['@stryker-mutator/vitest-runner'],
  testRunner: 'vitest',
  vitest: {
    // related: false — REQUIRED here, not a preference — see
    // stryker.dashboard-triage.config.mjs's header for the full incident this
    // guards against (Stryker's vitest runner defaults to `vitest --related`,
    // which cannot always resolve inside the sandbox and then finds NO tests
    // at all instead of failing loudly).
    related: false,
    // NOT the root vitest.config.ts — see this file's header for why.
    configFile: 'config/mutation/vitest.ci-detect-flaky.config.ts',
  },
  mutate: ['scripts/ci/detect-flaky.mjs'],
  // Same rationale as every other config here — see
  // stryker.dashboard-triage.config.mjs's header for the measured effect
  // (startup 75s -> 17s) of excluding the repo's ~1.4GB of runtime state from
  // each per-config sandbox copy.
  ignorePatterns: ['.autopilot', '.stryker-tmp*', 'reports', 'test-results', 'dist'],
  cleanTempDir: 'always',
  concurrency: 1,
  symlinkNodeModules: false,
  coverageAnalysis: 'perTest',
  // Static mutants are out of scope — see stryker.dashboard-triage.config.mjs's
  // header for the full reasoning (module-level constants built once at
  // import, before any test can activate them).
  ignoreStatic: true,
  thresholds: { high: 100, low: 100, break: 100 },
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/ci-detect-flaky/index.html' },
  jsonReporter: { fileName: 'reports/mutation/ci-detect-flaky/mutation.json' },
  tempDirName: '.stryker-tmp-ci-detect-flaky',
};
