// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for scripts/ci/dependency-audit.mjs (board
 * web-mubnvtwz-c8fgih, "Mutation coverage stops at the src boundary") — the
 * TWELFTH config to mutate anything under scripts/ci/, following
 * stryker.ci-run-all-mutation.config.mjs, stryker.ci-validate-spdx-headers.config.mjs,
 * stryker.ci-check-conflict-markers.config.mjs, stryker.ci-detect-flaky.config.mjs,
 * stryker.ci-quarantine-report.config.mjs, stryker.ci-license-check.config.mjs,
 * stryker.ci-secret-scan.config.mjs, stryker.ci-secret-scan-history.config.mjs,
 * stryker.ci-validate-no-personal-paths.config.mjs,
 * stryker.ci-check-doc-commit-refs.config.mjs and
 * stryker.ci-run-repo-census-tests.config.mjs. `findTransientAuditMarker`
 * (with its `clipEvidence` helper), `isTransientAuditFailure` and
 * `runAuditWithRetry` are mutated; `pnpmInvocation`, `runAuditOnce`, `main`
 * and the `isMain` entry line sit under `// Stryker disable all` comments in
 * the source since they spawn `pnpm audit` and call `process.exit`, the same
 * stance the other eleven ci/ configs take for their own impure glue.
 *
 * Why this target: `ci:dependency-audit` is the gate step that decides
 * whether a failed `pnpm audit` is a registry OUTAGE (retry, then degrade to
 * a warning, exit 0) or a real high+ VULNERABILITY (exit 1). A mutant that
 * got that call wrong fails CI OPEN — a real finding downgraded to green —
 * which is the one way this script can do more harm than having no audit at
 * all (guard-precision doctrine, docs/FAILURE-DOCTRINE.md row 6).
 *
 * Same shape of good target as stryker.ci-run-repo-census-tests.config.mjs:
 * the mutated functions are pure (audit output in, a classification or an
 * exit code out — `runOnce`, `sleep` and the log sinks are injected), import
 * only Node built-ins, and dependency-audit.test.ts asserts their output with
 * exact fixtures. Five new cases there close gaps the original suite left
 * open, each confirmed by planting the mutant by hand: the 160-character
 * evidence boundary (`>` -> `>=`), the trimmed output each of the three
 * verdict paths prints before its verdict line (`.trim()` removal), the OK
 * verdict's own text, the retry warning's `attempt N/M` counter, and the
 * zero-attempt fall-through that must fail closed rather than go green.
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
    configFile: 'config/mutation/vitest.ci-dependency-audit.config.ts',
  },
  mutate: ['scripts/ci/dependency-audit.mjs'],
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
  // import, before any test can activate them). Here that is `MAX_ATTEMPTS`,
  // `BASE_DELAY_MS`, `TRANSIENT_MARKERS`, `VULNERABILITY_REPORT_SIGNATURES`
  // and `EVIDENCE_MAX_CHARS` — the markers and report signatures are
  // nevertheless pinned by the outage corpus and the look-alike negative
  // corpus in dependency-audit.test.ts, and the attempt budget and evidence
  // limit by exact-text assertions.
  ignoreStatic: true,
  thresholds: { high: 100, low: 100, break: 100 },
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/ci-dependency-audit/index.html' },
  jsonReporter: { fileName: 'reports/mutation/ci-dependency-audit/mutation.json' },
  tempDirName: '.stryker-tmp-ci-dependency-audit',
};
