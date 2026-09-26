// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for scripts/ci/npx-smoke-test.mjs (board
 * web-mubnvtwz-c8fgih, "Mutation coverage stops at the src boundary") — the
 * SEVENTEENTH config to mutate anything under scripts/ci/.
 *
 * Only the five pure helpers are mutated: `workspaceClosure`, `tarballName`,
 * `packedFileOffenders`, `assertShebangIsLf` and `buildScratchManifest`.
 * Everything that shells out to pnpm/npm/npx, reads the real tree, binds a
 * port or boots a server sits inside its own `// Stryker disable all` block
 * in the source — the same stance validate-configs.mjs takes for its
 * `parseConfig`/`listTrackedFiles`/`main`.
 *
 * A surviving mutant here could let a tarball that leaks `src/` past the
 * "files" allowlist, a CRLF shebang the OS loader refuses to exec, or a
 * workspace dependency left out of the packed closure pass
 * `ci:npx-smoke-test` silently.
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
    configFile: 'config/mutation/vitest.ci-npx-smoke-test.config.ts',
  },
  mutate: ['scripts/ci/npx-smoke-test.mjs'],
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
  // import, before any test can activate them). That is why
  // `packedFileOffenders` builds its allowlist pattern inside the function.
  ignoreStatic: true,
  thresholds: { high: 100, low: 100, break: 100 },
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/ci-npx-smoke-test/index.html' },
  jsonReporter: { fileName: 'reports/mutation/ci-npx-smoke-test/mutation.json' },
  tempDirName: '.stryker-tmp-ci-npx-smoke-test',
};
