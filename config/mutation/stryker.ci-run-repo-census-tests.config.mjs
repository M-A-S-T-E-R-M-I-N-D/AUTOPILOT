// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for scripts/ci/run-repo-census-tests.mjs (board
 * web-mubnvtwz-c8fgih, "Mutation coverage stops at the src boundary") — the
 * ELEVENTH config to mutate anything under scripts/ci/, following
 * stryker.ci-run-all-mutation.config.mjs, stryker.ci-validate-spdx-headers.config.mjs,
 * stryker.ci-check-conflict-markers.config.mjs, stryker.ci-detect-flaky.config.mjs,
 * stryker.ci-quarantine-report.config.mjs, stryker.ci-license-check.config.mjs,
 * stryker.ci-secret-scan.config.mjs, stryker.ci-secret-scan-history.config.mjs,
 * stryker.ci-validate-no-personal-paths.config.mjs and
 * stryker.ci-check-doc-commit-refs.config.mjs. `isRepoReadingTest` and
 * `censusTestFiles` (which calls the unexported `testFilesUnder`) are
 * mutated; `main` and the `isMain` entry line sit under a `// Stryker disable
 * all` comment in the source since `main` shells out to `vitest` and calls
 * `process.exit`, the same stance the other ten ci/ configs take for their
 * own impure glue.
 *
 * Why this target: run-repo-census-tests.mjs is itself part of the gate —
 * `pnpm run test:registry-guards` uses it to find every test that reads the
 * repository BY PATH (README.md, docs/, config/, .github/) rather than
 * importing it, so the per-firing `vitest run --changed` selection (which
 * walks the import graph) cannot see it. A lane once added a Stryker config
 * whose README-count-pinning test never ran at the per-firing gate because of
 * exactly this blind spot, and the flight branch went red four times in one
 * round before a full gate caught it (see the source file's own header). A
 * mutant that returned nothing, walked the wrong directory, or filtered by
 * the wrong pattern would silently shrink this safety net back to the four
 * hand-listed `ALWAYS` tests, and every per-firing gate would go back to
 * missing exactly the class of test this script exists to catch.
 *
 * Same shape of good target as stryker.ci-check-doc-commit-refs.config.mjs:
 * the mutated functions are pure (a root directory in, a sorted, deduped file
 * list out), import only Node built-ins, and
 * run-repo-census-tests.test.ts asserts their output with exact `toEqual`
 * fixtures against a throwaway temp directory tree, plus the real repo tree.
 * Two mutants are provably unobservable on this repo's mutation runner
 * (ubuntu-latest — see .github/workflows/mutation.yml) and carry a `Stryker
 * disable next-line` in the source with the proof, rather than a lowered
 * threshold:
 * - `readFileSync(path, 'utf8')`'s encoding argument: a Buffer and a utf8
 *   string agree under `RegExp#test` (ToString coercion meets Buffer's own
 *   utf8-default `toString()`), so `isRepoReadingTest` cannot tell them apart.
 * - `.split('\\').join('/')`'s join separator: node:path never emits `\` on
 *   POSIX, so `.split('\\')` always yields a single-element array and the
 *   join separator has nothing to join.
 *
 * Two new fixtures in run-repo-census-tests.test.ts close gaps the original
 * two-package-tree fixture left open: one proves the `packages` root
 * contributes at all (the original fixture's only `packages/b` file that
 * survives to `found` was excluded by other rules — node_modules, non-`.test.ts`
 * — never by reaching `packages/*` itself), and one proves only a package's
 * `test/` subtree is scanned, not the package root (a stray repo-reading
 * `.test.ts` file one level up from `test/` must NOT appear).
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
    configFile: 'config/mutation/vitest.ci-run-repo-census-tests.config.ts',
  },
  mutate: ['scripts/ci/run-repo-census-tests.mjs'],
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
  // import, before any test can activate them). Here that is `ALWAYS`,
  // `FS_READ_RE` and `REPO_PATH_RE` — the pattern is nevertheless pinned
  // clause by clause by the positive and look-alike-negative fixtures in
  // run-repo-census-tests.test.ts.
  ignoreStatic: true,
  thresholds: { high: 100, low: 100, break: 100 },
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/ci-run-repo-census-tests/index.html' },
  jsonReporter: { fileName: 'reports/mutation/ci-run-repo-census-tests/mutation.json' },
  tempDirName: '.stryker-tmp-ci-run-repo-census-tests',
};
