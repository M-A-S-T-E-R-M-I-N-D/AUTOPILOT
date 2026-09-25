// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for scripts/ci/secret-scan-history.mjs (board
 * web-mubnvtwz-c8fgih, "Mutation coverage stops at the src boundary") — the
 * EIGHTH config to mutate anything under scripts/ci/, following
 * stryker.ci-run-all-mutation.config.mjs, stryker.ci-validate-spdx-headers.config.mjs,
 * stryker.ci-check-conflict-markers.config.mjs, stryker.ci-detect-flaky.config.mjs,
 * stryker.ci-quarantine-report.config.mjs, stryker.ci-license-check.config.mjs
 * and stryker.ci-secret-scan.config.mjs. Only `parseAddedLines` and
 * `scanPatch` are mutated; the git plumbing (`readRefUpdates`,
 * `commitsForRefUpdate`, `isMergeCommit`, `patchForCommit`) and `main` sit
 * under a `// Stryker disable all` comment in the source since they read the
 * pre-push hook's stdin, shell out to `git rev-list`/`git diff-tree` and call
 * `process.exit`, the same stance the other seven ci/ configs take for their
 * own impure glue.
 *
 * Why this target matters as much as secret-scan.mjs's: `scanPatch` is the
 * pre-push half of the secret gate. secret-scan.mjs only sees the final
 * tree, so a credential added in one commit and removed in the next is
 * invisible to it — GitHub push protection still scans every pushed commit
 * and blocks the push, and the fix is then a history rewrite this project's
 * additive-only git policy forbids without a human decision (FAILURE-DOCTRINE,
 * the push-protection history: main blocked for two days by exactly that).
 * A parser mutant that silently dropped an added line, mis-tracked which
 * file it belongs to or skipped the binary/exclusion checks in the wrong
 * direction would turn this gate green on a leaked key.
 *
 * The scanning itself (`findSecrets`, the RULES regexes, `redact`) is
 * imported from secret-scan.mjs and mutated by THAT script's config, not
 * here — `mutate` names this file alone, so those imports run un-instrumented.
 *
 * Same shape of good target as stryker.ci-secret-scan.config.mjs: the two
 * mutated functions are pure (a string in, an array out) and
 * secret-scan-history.test.ts asserts their output with exact `toEqual`
 * fixtures, line numbers included. The two header regexes are module-level
 * constants, so every Regex-mutator mutant on them is static and ignored
 * (see `ignoreStatic` below) — each is nevertheless pinned by positive
 * fixtures AND a look-alike negative fixture (an added line that quotes a
 * `diff --git` header mid-line, an added line that starts with `+++ b/`), the
 * guard-precision doctrine that is stronger than what a regex mutant could
 * check. The one provably uncoverable mutant (the `?? ''` fallback no matched
 * header ever takes, since its capture group needs at least one character)
 * carries a `Stryker disable next-line` in the source with the proof, rather
 * than a lowered threshold.
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
    configFile: 'config/mutation/vitest.ci-secret-scan-history.config.ts',
  },
  mutate: ['scripts/ci/secret-scan-history.mjs'],
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
  // import, before any test can activate them). Here that is FILE_HEADER_RE,
  // HUNK_HEADER_RE, ZERO_SHA and GIT_OPTS — the two header regexes are
  // nevertheless pinned by positive and look-alike negative fixtures in
  // secret-scan-history.test.ts, and the other two feed only the disabled
  // git plumbing.
  ignoreStatic: true,
  thresholds: { high: 100, low: 100, break: 100 },
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/ci-secret-scan-history/index.html' },
  jsonReporter: { fileName: 'reports/mutation/ci-secret-scan-history/mutation.json' },
  tempDirName: '.stryker-tmp-ci-secret-scan-history',
};
