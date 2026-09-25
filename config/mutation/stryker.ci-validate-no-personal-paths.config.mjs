// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for scripts/ci/validate-no-personal-paths.mjs (board
 * web-mubnvtwz-c8fgih, "Mutation coverage stops at the src boundary") — the
 * NINTH config to mutate anything under scripts/ci/, following
 * stryker.ci-run-all-mutation.config.mjs, stryker.ci-validate-spdx-headers.config.mjs,
 * stryker.ci-check-conflict-markers.config.mjs, stryker.ci-detect-flaky.config.mjs,
 * stryker.ci-quarantine-report.config.mjs, stryker.ci-license-check.config.mjs,
 * stryker.ci-secret-scan.config.mjs and stryker.ci-secret-scan-history.config.mjs.
 * Only `findPersonalPaths` (and the three `isSafe` exemption bodies it calls)
 * is mutated; `listTrackedFiles`, `main` and the `isMain` entry line sit under
 * a `// Stryker disable all` comment in the source since they shell out to
 * `git ls-files`, read the whole tree and call `process.exit`, the same
 * stance the other eight ci/ configs take for their own impure glue.
 *
 * Why this target: ci:no-personal-paths is the privacy half of the pre-push
 * wall that secret-scan.mjs is the credential half of. The mandate it
 * enforces is absolute — no private data, ever (MASTER-PLAN §9): no user-home
 * path carrying a real username, no personal-provider address other than the
 * operator's ONE declared public identity, and neither of the two dead
 * attribution identities (operator directive 2026-09-07). A mutant that
 * quietly returned no findings, that flipped the `isSafe` exemption so every
 * leak read as safe, or that widened the identity exemption past its exact
 * string would turn this gate green on exactly the leak it exists to stop,
 * and a personal path or address that reaches the public remote cannot be
 * un-published by any additive-git means.
 *
 * Same shape of good target as stryker.ci-secret-scan.config.mjs: the mutated
 * function is pure (a file's text in, an array out), imports only Node
 * built-ins, and validate-no-personal-paths.test.ts asserts its output with
 * exact `toEqual` fixtures — rule ids, line numbers and the matched text —
 * plus a 45-shape negative corpus (the guard-precision doctrine). The two
 * provably unobservable mutants on the line loop (the `<=` bound that scans
 * one extra empty line, and the `?? ''` fallback no in-bounds index ever
 * takes) carry a `Stryker disable next-line` in the source with the proof,
 * exactly as secret-scan.mjs's identical loop does, rather than a lowered
 * threshold.
 *
 * The RULES table and SAFE_WINDOWS_DRIVE_PATH are module-level constants, so
 * every Regex-mutator mutant on them is static and ignored (see `ignoreStatic`
 * below) — each rule is nevertheless pinned by a positive fixture AND
 * look-alike negatives in the test's corpus, which is stronger than what a
 * regex mutant could check. The three `isSafe` arrows are the one part of the
 * table that runs per call: the mutants INSIDE their bodies (the
 * `toLowerCase()` swap, the `===` flip, the emptied identity literal) are
 * live and each is killed by an exemption fixture; the whole-arrow
 * `() => undefined` mutant is either static (its switch sits in the table
 * built at import) or, if Stryker places it inside the body, killed by the
 * same fixtures — no threshold depends on which.
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
    configFile: 'config/mutation/vitest.ci-validate-no-personal-paths.config.ts',
  },
  mutate: ['scripts/ci/validate-no-personal-paths.mjs'],
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
  // import, before any test can activate them). Here that is
  // SAFE_WINDOWS_DRIVE_PATH, RULES (its regexes and the assembled
  // dead-identity pattern), EXCLUDED_FILES, BINARY_EXT and NUL — every RULES
  // entry is nevertheless pinned by a positive and a look-alike negative
  // fixture in validate-no-personal-paths.test.ts.
  ignoreStatic: true,
  thresholds: { high: 100, low: 100, break: 100 },
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/ci-validate-no-personal-paths/index.html' },
  jsonReporter: { fileName: 'reports/mutation/ci-validate-no-personal-paths/mutation.json' },
  tempDirName: '.stryker-tmp-ci-validate-no-personal-paths',
};
