// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for scripts/ci/check-doc-commit-refs.mjs (board
 * web-mubnvtwz-c8fgih, "Mutation coverage stops at the src boundary") — the
 * TENTH config to mutate anything under scripts/ci/, following
 * stryker.ci-run-all-mutation.config.mjs, stryker.ci-validate-spdx-headers.config.mjs,
 * stryker.ci-check-conflict-markers.config.mjs, stryker.ci-detect-flaky.config.mjs,
 * stryker.ci-quarantine-report.config.mjs, stryker.ci-license-check.config.mjs,
 * stryker.ci-secret-scan.config.mjs, stryker.ci-secret-scan-history.config.mjs
 * and stryker.ci-validate-no-personal-paths.config.mjs. Only `findShaCitations`
 * is mutated; `listTrackedMarkdown`, `isReachableFromHead`, `main` and the
 * `isMain` entry line sit under a `// Stryker disable all` comment in the
 * source since they shell out to `git ls-files` / `git merge-base`, read the
 * whole tree and call `process.exit`, the same stance the other nine ci/
 * configs take for their own impure glue.
 *
 * Why this target: ci:doc-commit-refs is the gate that keeps a doc's evidence
 * honest — a backtick-quoted SHA cited as proof ("Done — `abc1234` fixed it")
 * must resolve to a real ancestor of HEAD, because this repo's history has
 * been rewritten often enough (reapply/revert cycles, squashes) that
 * citations silently go pre-genesis (board web-mtndm581-4cimlx).
 * `findShaCitations` is the ONLY part of the gate that decides what counts as
 * a citation: a mutant that returned nothing would pass every doc unchecked,
 * one that mis-numbered the line would send the reader to the wrong place,
 * and one that stopped after the first span on a line would let a second,
 * unreachable SHA hide behind a reachable first one — and each would keep
 * ci:doc-commit-refs green while doing it.
 *
 * Same shape of good target as stryker.ci-secret-scan.config.mjs and
 * stryker.ci-validate-no-personal-paths.config.mjs: the mutated function is
 * pure (a file's text in, an array out), imports only Node built-ins, and
 * check-doc-commit-refs.test.ts asserts its output with exact `toEqual`
 * fixtures — line numbers and the matched SHA — plus a set of look-alike
 * negatives (bare hex in prose, hex inside a longer identifier, a 64-char
 * digest, a too-short run, non-hex code spans). The two provably unobservable
 * mutants on the line loop (the `<=` bound that scans one extra empty line,
 * and the `?? ''` fallback no in-bounds index ever takes) carry a `Stryker
 * disable next-line` in the source with the proof, exactly as the identical
 * loop in secret-scan.mjs and validate-no-personal-paths.mjs does, rather
 * than a lowered threshold. The `i++` -> `i--` UpdateOperator mutant never
 * leaves the loop (a negative index reads as an empty line forever), so
 * Stryker reports it as a timeout — killed, not survived.
 *
 * SHA_CITATION_RE and LEGACY_ALLOWLIST are module-level constants, so every
 * Regex and StringLiteral mutant on them is static and ignored (see
 * `ignoreStatic` below) — the pattern's every clause is nevertheless pinned by
 * the test's fixtures (7- and 40-char runs, the closing-backtick and
 * trailing-prose terminators, and the negatives above), which is stronger
 * than what a regex mutant could check.
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
    configFile: 'config/mutation/vitest.ci-check-doc-commit-refs.config.ts',
  },
  mutate: ['scripts/ci/check-doc-commit-refs.mjs'],
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
  // import, before any test can activate them). Here that is SHA_CITATION_RE,
  // LEGACY_ALLOWLIST and NUL — the pattern is nevertheless pinned clause by
  // clause by the positive and look-alike-negative fixtures in
  // check-doc-commit-refs.test.ts.
  ignoreStatic: true,
  thresholds: { high: 100, low: 100, break: 100 },
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/ci-check-doc-commit-refs/index.html' },
  jsonReporter: { fileName: 'reports/mutation/ci-check-doc-commit-refs/mutation.json' },
  tempDirName: '.stryker-tmp-ci-check-doc-commit-refs',
};
