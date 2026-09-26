// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for scripts/ci/check-model-freshness.mjs (board
 * web-mubnvtwz-c8fgih, "Mutation coverage stops at the src boundary") — the
 * THIRTEENTH config to mutate anything under scripts/ci/, following
 * stryker.ci-run-all-mutation.config.mjs, stryker.ci-validate-spdx-headers.config.mjs,
 * stryker.ci-check-conflict-markers.config.mjs, stryker.ci-detect-flaky.config.mjs,
 * stryker.ci-quarantine-report.config.mjs, stryker.ci-license-check.config.mjs,
 * stryker.ci-secret-scan.config.mjs, stryker.ci-secret-scan-history.config.mjs,
 * stryker.ci-validate-no-personal-paths.config.mjs,
 * stryker.ci-check-doc-commit-refs.config.mjs,
 * stryker.ci-run-repo-census-tests.config.mjs and
 * stryker.ci-dependency-audit.config.mjs. `catalogueIds`,
 * `catalogueFamilies`, `cataloguePinnedIds`, `resolveAliasFromUsage`,
 * `findStalePins`, `extractAdvertisedAliases` and `findUnknownFamilyAliases`
 * are mutated; `probeAlias`, `cliModelHelp`, `main` and the `isMain` entry
 * line sit under `// Stryker disable all` comments in the source since they
 * shell out to the `claude` CLI (the probe spends a real paid call) and set
 * `process.exitCode`, the same stance the other twelve ci/ configs take for
 * their own impure glue.
 *
 * Why this target: `ci:model-freshness` is the check that says whether the
 * model catalogue has gone stale. It already shipped one false positive
 * (`'agent'` read from an unrelated flag) and one false OK (the pinned Opus
 * stale while the check passed), both recorded in its header. A mutant that
 * reads the family list, the pins or the alias sentence wrong brings either
 * failure back without a test going red (guard-precision doctrine,
 * docs/FAILURE-DOCTRINE.md row 6).
 *
 * Same shape of good target as stryker.ci-dependency-audit.config.mjs: the
 * mutated functions are pure (catalogue source, help text or a probe reply
 * in, a list or a finding out), import only Node built-ins, and
 * check-model-freshness.test.ts asserts their output with exact fixtures.
 * `catalogueIds` and `catalogueFamilies` now take the catalogue source as a
 * defaulted parameter, the way `cataloguePinnedIds` already did, so they can
 * be tested at all; new cases there pin them, the any-whitespace tolerance of
 * every source regex, pinned entries missing an id or a family (compared
 * with toStrictEqual, since toEqual ignores an `undefined` value), a `null`
 * probe reply, and the exact text of an unresolved-family finding.
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
    configFile: 'config/mutation/vitest.ci-check-model-freshness.config.ts',
  },
  mutate: ['scripts/ci/check-model-freshness.mjs'],
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
  // import, before any test can activate them). Here that is `STRICT` and
  // `PROBE`, read only by `main`, and `CATALOGUE_SRC`, whose path the
  // real-catalogue cases pin anyway (a wrong path finds no families).
  ignoreStatic: true,
  thresholds: { high: 100, low: 100, break: 100 },
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/ci-check-model-freshness/index.html' },
  jsonReporter: { fileName: 'reports/mutation/ci-check-model-freshness/mutation.json' },
  tempDirName: '.stryker-tmp-ci-check-model-freshness',
};
