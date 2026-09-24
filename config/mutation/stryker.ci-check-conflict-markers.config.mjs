// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for scripts/ci/check-conflict-markers.mjs (board
 * web-mubnvtwz-c8fgih, "Mutation coverage stops at the src boundary") — the
 * THIRD config to mutate anything under scripts/ci/, following
 * stryker.ci-run-all-mutation.config.mjs and
 * stryker.ci-validate-spdx-headers.config.mjs. Only `findConflictMarkers` is
 * mutated; `listTrackedFiles` and `main` carry a `// Stryker disable all`
 * comment in the source since they shell out to git and read the whole tree,
 * the same stance the other two ci/ configs take for their own impure glue.
 *
 * A surviving mutant here would let an unresolved git conflict marker slip
 * past the CI gate silently — the exact drift that shipped once already
 * (docs/BACKLOG-999-ARCHIVE.md, `d448f8b7`) before this script existed.
 *
 * Same shape of good target as stryker.ci-validate-spdx-headers.config.mjs:
 * effectively zero imports (only Node built-ins) and exercised with concrete
 * expected-output assertions by check-conflict-markers.test.ts.
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
    configFile: 'config/mutation/vitest.ci-check-conflict-markers.config.ts',
  },
  mutate: ['scripts/ci/check-conflict-markers.mjs'],
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
  htmlReporter: { fileName: 'reports/mutation/ci-check-conflict-markers/index.html' },
  jsonReporter: { fileName: 'reports/mutation/ci-check-conflict-markers/mutation.json' },
  tempDirName: '.stryker-tmp-ci-check-conflict-markers',
};
