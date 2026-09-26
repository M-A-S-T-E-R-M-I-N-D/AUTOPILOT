// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for scripts/ci/launcher-smoke-cmd.mjs (board
 * web-mubnvtwz-c8fgih, "Mutation coverage stops at the src boundary") — the
 * TWENTIETH config to mutate anything under scripts/ci/, and the one that
 * leaves no scripts/ci/*.mjs unmutated.
 *
 * Only the six helpers are mutated: `isCmdLauncher`, `discoverCmdLaunchers`,
 * `assertManifestCovers`, `scenariosFor`, `readRecord` and `checkScenario`
 * (plus the `assert` they share). The pnpm stub, the node recorders, the
 * scratch copies, the `cmd.exe` runs and `main` sit inside `// Stryker
 * disable all` blocks in the source, the same stance launcher-smoke.mjs takes
 * for its `bash` runs. The MANIFEST is static (see `ignoreStatic` below); the
 * test pins it against the launchers actually on disk.
 *
 * A surviving mutant here could let a `.cmd` launcher that forwards a stray
 * argument, skips its build, or runs node after a failed build pass
 * `ci:launcher-smoke-cmd` on the Windows leg silently.
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
    configFile: 'config/mutation/vitest.ci-launcher-smoke-cmd.config.ts',
  },
  mutate: ['scripts/ci/launcher-smoke-cmd.mjs'],
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
  htmlReporter: { fileName: 'reports/mutation/ci-launcher-smoke-cmd/index.html' },
  jsonReporter: { fileName: 'reports/mutation/ci-launcher-smoke-cmd/mutation.json' },
  tempDirName: '.stryker-tmp-ci-launcher-smoke-cmd',
};
