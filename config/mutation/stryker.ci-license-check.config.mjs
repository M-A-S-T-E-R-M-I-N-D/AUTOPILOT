// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for scripts/ci/license-check.mjs (board
 * web-mubnvtwz-c8fgih, "Mutation coverage stops at the src boundary") — the
 * SIXTH config to mutate anything under scripts/ci/, following
 * stryker.ci-run-all-mutation.config.mjs, stryker.ci-validate-spdx-headers.config.mjs,
 * stryker.ci-check-conflict-markers.config.mjs, stryker.ci-detect-flaky.config.mjs
 * and stryker.ci-quarantine-report.config.mjs. Only `isAllowedLicenseId`,
 * `isAllowedLicenseExpression` and `findLicenseViolations` are mutated; the
 * pnpm invocation, `runLicensesList` and `main` sit under a `// Stryker
 * disable all` comment in the source since they shell out to `pnpm licenses
 * list` and call `process.exit`, the same stance the other five ci/ configs
 * take for their own impure glue.
 *
 * A surviving mutant here would let a copyleft (GPL/AGPL/SSPL) or unknown
 * license into the dependency graph silently — turning the default-deny
 * allowlist into a default-allow one is exactly the failure mode the
 * ci:license-check gate exists to prevent (PATTERNS-AND-STANDARDS §4,
 * "validators-as-gates"), and a prefix-match regression there once let two
 * unaudited SPDX variants through (see the source's EXACT_ALLOWED note).
 *
 * Same shape of good target as stryker.ci-quarantine-report.config.mjs:
 * effectively zero imports (only Node built-ins) and exercised with concrete
 * expected-output assertions by license-check.test.ts. The two provably
 * equivalent mutants on the empty-id guard carry a `Stryker disable next-line`
 * in the source rather than a lowered threshold.
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
    configFile: 'config/mutation/vitest.ci-license-check.config.ts',
  },
  mutate: ['scripts/ci/license-check.mjs'],
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
  // import, before any test can activate them). Here that is EXACT_ALLOWED,
  // whose every id license-check.test.ts nevertheless asserts individually.
  ignoreStatic: true,
  thresholds: { high: 100, low: 100, break: 100 },
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/ci-license-check/index.html' },
  jsonReporter: { fileName: 'reports/mutation/ci-license-check/mutation.json' },
  tempDirName: '.stryker-tmp-ci-license-check',
};
