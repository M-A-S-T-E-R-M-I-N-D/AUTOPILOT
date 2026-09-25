// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for scripts/ci/secret-scan.mjs (board
 * web-mubnvtwz-c8fgih, "Mutation coverage stops at the src boundary") — the
 * SEVENTH config to mutate anything under scripts/ci/, following
 * stryker.ci-run-all-mutation.config.mjs, stryker.ci-validate-spdx-headers.config.mjs,
 * stryker.ci-check-conflict-markers.config.mjs, stryker.ci-detect-flaky.config.mjs,
 * stryker.ci-quarantine-report.config.mjs and stryker.ci-license-check.config.mjs.
 * Only `findSecrets` and its `redact` helper are mutated; `listTrackedFiles`
 * and `main` sit under a `// Stryker disable all` comment in the source since
 * they shell out to `git ls-files`, read the whole tree and call
 * `process.exit`, the same stance the other six ci/ configs take for their
 * own impure glue.
 *
 * A surviving mutant here is the worst kind: `findSecrets` is the ONLY line
 * of defence between a credential-shaped literal and a public push
 * (ci:secret-scan on every PR, ci:secret-scan-history over every pushed
 * commit — secret-scan-history.mjs imports this very function). A loop or
 * line-number mutant that quietly returned no findings would turn the gate
 * green on a leaked key, and a `redact` mutant that revealed one character
 * too many would print the live secret into a CI log that is retained far
 * longer than the commit (PATTERNS-AND-STANDARDS §2, format-based rules;
 * FAILURE-DOCTRINE, the push-protection history).
 *
 * Same shape of good target as stryker.ci-license-check.config.mjs:
 * effectively zero imports (only Node built-ins) and exercised with concrete
 * expected-output assertions by secret-scan.test.ts, including exact redaction
 * fingerprints at, below and above the 8-character reveal threshold. The two
 * provably unobservable mutants on the line loop (the `<=` bound that scans
 * one extra empty line, and the `?? ''` fallback no in-bounds index ever
 * takes) carry a `Stryker disable next-line` in the source with the proof,
 * rather than a lowered threshold.
 *
 * The thirteen RULES regexes themselves are module-level constants, so every
 * Regex-mutator mutant on them is static and ignored (see `ignoreStatic`
 * below) — each rule is nevertheless pinned by a positive fixture AND a
 * look-alike negative fixture in secret-scan.test.ts (the guard-precision
 * doctrine), which is stronger than what a regex mutant could check.
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
    configFile: 'config/mutation/vitest.ci-secret-scan.config.ts',
  },
  mutate: ['scripts/ci/secret-scan.mjs'],
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
  // import, before any test can activate them). Here that is RULES,
  // EXCLUDED_FILES and BINARY_EXT — every RULES entry is nevertheless pinned
  // by a positive and a look-alike negative fixture in secret-scan.test.ts.
  ignoreStatic: true,
  thresholds: { high: 100, low: 100, break: 100 },
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/ci-secret-scan/index.html' },
  jsonReporter: { fileName: 'reports/mutation/ci-secret-scan/mutation.json' },
  tempDirName: '.stryker-tmp-ci-secret-scan',
};
