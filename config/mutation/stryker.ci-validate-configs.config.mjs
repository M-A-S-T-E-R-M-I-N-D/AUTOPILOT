// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for scripts/ci/validate-configs.mjs (board
 * web-mubnvtwz-c8fgih, "Mutation coverage stops at the src boundary") — the
 * SIXTEENTH config to mutate anything under scripts/ci/.
 *
 * Only `findUnpinnedActions` and `stripJsonComments` are mutated;
 * `parseConfig`, `listTrackedFiles` and `main` each carry their own
 * `// Stryker disable all` in the source since they read real files off disk
 * or shell out to `git ls-files` and can only be exercised by running the
 * gate for real — the same stance check-conflict-markers.mjs's
 * `listTrackedFiles`/`main` take for their own impure glue.
 *
 * A surviving mutant here could let a workflow step floating on a mutable tag
 * (check #8, OpenSSF Scorecard "Pinned-Dependencies") or a JSONC config the
 * gate misparses (check #1) pass `ci:validate-configs` silently.
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
    configFile: 'config/mutation/vitest.ci-validate-configs.config.ts',
  },
  mutate: ['scripts/ci/validate-configs.mjs'],
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
  htmlReporter: { fileName: 'reports/mutation/ci-validate-configs/index.html' },
  jsonReporter: { fileName: 'reports/mutation/ci-validate-configs/mutation.json' },
  tempDirName: '.stryker-tmp-ci-validate-configs',
};
