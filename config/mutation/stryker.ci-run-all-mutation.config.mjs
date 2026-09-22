// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for scripts/ci/run-all-mutation.mjs (board
 * web-mubnvtwz-c8fgih, "Mutation coverage stops at the src boundary") — the
 * FIRST config to mutate anything under scripts/ci/: every existing config
 * under config/mutation/ targets a src tree under apps/ or packages/, so the
 * CI scripts and the sweep runner itself were unverified by mutation testing
 * even though run-all-mutation.test.ts exercises them with real assertions.
 *
 * run-all-mutation.mjs IS the discovery-based sweep runner every other
 * mutation:* script (and the nightly/PR mutation workflows) run through, so
 * a surviving mutant here is disproportionately dangerous: a flipped
 * comparison in `mutationFailureReason` could misreport an infra kill
 * (SIGKILL, OOM) as a survived mutant or vice versa, a broken
 * `selectConfigFiles`/`shardConfigFiles` could silently skip configs from a
 * `--diff` or `--shard` run, and a weakened `formatFailureSummary` could
 * drop a failing config from the printed tally.
 *
 * Same shape of good target as triage.ts (stryker.dashboard-triage.config.mjs):
 * effectively zero imports (only Node built-ins) and exercised with concrete
 * expected-output assertions by run-all-mutation.test.ts.
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
    configFile: 'config/mutation/vitest.ci-run-all-mutation.config.ts',
  },
  mutate: ['scripts/ci/run-all-mutation.mjs'],
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
  htmlReporter: { fileName: 'reports/mutation/ci-run-all-mutation/index.html' },
  jsonReporter: { fileName: 'reports/mutation/ci-run-all-mutation/mutation.json' },
  tempDirName: '.stryker-tmp-ci-run-all-mutation',
};
