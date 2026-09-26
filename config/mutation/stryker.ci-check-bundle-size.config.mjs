// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for scripts/ci/check-bundle-size.mjs (board
 * web-mubnvtwz-c8fgih, "Mutation coverage stops at the src boundary") — the
 * EIGHTEENTH config to mutate anything under scripts/ci/.
 *
 * Only the three helpers are mutated: `formatKb`, `measure` and
 * `checkBundleSize`. `main` — which imports the real dist output and exits
 * the process — sits inside a `// Stryker disable all` block in the source,
 * the same stance npx-smoke-test.mjs takes for its process glue. The budget
 * constants are static (see `ignoreStatic` below); their values are pinned by
 * the mirror census in apps/dashboard/test/server/client-bundle-size-budget.test.ts.
 *
 * A surviving mutant here could let a chunk past its raw or gzip budget, or
 * turn a red budget check into exit 0, so `ci:bundle-size` passes a bloated
 * first-load bundle silently.
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
    configFile: 'config/mutation/vitest.ci-check-bundle-size.config.ts',
  },
  mutate: ['scripts/ci/check-bundle-size.mjs'],
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
  htmlReporter: { fileName: 'reports/mutation/ci-check-bundle-size/index.html' },
  jsonReporter: { fileName: 'reports/mutation/ci-check-bundle-size/mutation.json' },
  tempDirName: '.stryker-tmp-ci-check-bundle-size',
};
