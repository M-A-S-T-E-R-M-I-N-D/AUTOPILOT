// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for scripts/ci/audit-board-flood.mjs (board
 * web-mubnvtwz-c8fgih, "Mutation coverage stops at the src boundary") — the
 * FIFTEENTH config to mutate anything under scripts/ci/.
 *
 * Only `normalize`, `similarity`, `auditThread` and the `snippet` helper they
 * call are mutated; `gh`, `threadMessages` and `main` each carry their own
 * `// Stryker disable all` in the source since they shell out to the real
 * `gh` CLI against a live repo and can only be exercised by running the gate
 * for real — the same stance quarantine-report.mjs's `main` and
 * check-conflict-markers.mjs's `listTrackedFiles`/`main` take for their own
 * impure glue.
 *
 * A surviving mutant here could let a real flood — a retried near-duplicate,
 * a three-in-a-row run, or a rapid-fire pair the anti-flood law exists to
 * catch (this script's own header names the PR #33 and issue #16 incidents)
 * — pass `ci:audit-board-flood` silently.
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
    configFile: 'config/mutation/vitest.ci-audit-board-flood.config.ts',
  },
  mutate: ['scripts/ci/audit-board-flood.mjs'],
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
  htmlReporter: { fileName: 'reports/mutation/ci-audit-board-flood/index.html' },
  jsonReporter: { fileName: 'reports/mutation/ci-audit-board-flood/mutation.json' },
  tempDirName: '.stryker-tmp-ci-audit-board-flood',
};
