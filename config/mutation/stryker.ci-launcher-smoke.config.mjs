// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for scripts/ci/launcher-smoke.mjs (board
 * web-mubnvtwz-c8fgih, "Mutation coverage stops at the src boundary") — the
 * NINETEENTH config to mutate anything under scripts/ci/.
 *
 * Only the six helpers are mutated: `isShLauncher`, `discoverShLaunchers`,
 * `assertManifestCovers`, `scenariosFor`, `readRecord` and `checkScenario`
 * (plus the `assert` they share). The recording stubs, the scratch copies,
 * the `bash` runs and `main` sit inside `// Stryker disable all` blocks in
 * the source, the same stance npx-smoke-test.mjs takes for its process glue.
 * The MANIFEST is static (see `ignoreStatic` below); the test pins it against
 * the launchers actually on disk.
 *
 * A surviving mutant here could let a launcher that forwards a stray argument,
 * skips its build, or runs node after a failed build pass `ci:launcher-smoke`
 * silently — the exact PR #20 class of bug this gate exists to catch.
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
    configFile: 'config/mutation/vitest.ci-launcher-smoke.config.ts',
  },
  mutate: ['scripts/ci/launcher-smoke.mjs'],
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
  htmlReporter: { fileName: 'reports/mutation/ci-launcher-smoke/index.html' },
  jsonReporter: { fileName: 'reports/mutation/ci-launcher-smoke/mutation.json' },
  tempDirName: '.stryker-tmp-ci-launcher-smoke',
};
