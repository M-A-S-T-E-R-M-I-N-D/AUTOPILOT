// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for scripts/ci/check-merge-integrity.mjs (board
 * web-mubnvtwz-c8fgih, "Mutation coverage stops at the src boundary") — the
 * FOURTEENTH config to mutate anything under scripts/ci/.
 *
 * A surviving mutant here could let a `git merge -s ours` that silently
 * discarded a parent's real work pass as a clean merge — the exact failure
 * this script exists to catch (its own header names the 2026-09-09 incident).
 *
 * Unlike most of the other ci/ configs, the WHOLE file is mutated, including
 * `main` and the git-shelling helpers: merge-integrity.test.ts never mocks
 * git, it builds real temp repos and runs the script end-to-end via
 * execFileSync, so every function — `addedLines`, `git`, `mergeCommits`,
 * `treeIdenticalTo`, `main` — is genuinely exercised, not just the pure
 * logic. Only the one `parents.length < 2` guard carries its own
 * `// Stryker disable next-line`, documented in place as unreachable given
 * `git log --merges`' own definition of a merge commit.
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
    configFile: 'config/mutation/vitest.ci-check-merge-integrity.config.ts',
  },
  mutate: ['scripts/ci/check-merge-integrity.mjs'],
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
  htmlReporter: { fileName: 'reports/mutation/ci-check-merge-integrity/index.html' },
  jsonReporter: { fileName: 'reports/mutation/ci-check-merge-integrity/mutation.json' },
  tempDirName: '.stryker-tmp-ci-check-merge-integrity',
};
