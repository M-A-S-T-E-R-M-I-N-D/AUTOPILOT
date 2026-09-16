// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for apps/dashboard/src/connection/cli-probe.ts (backlog
 * web-msnswvcq-viays2, "MUTATION TESTING") — next after connection/config.ts
 * (stryker.dashboard-connection-config.config.mjs), continuing to widen
 * through connection/'s pure logic.
 *
 * cli-probe.ts is the cheap local-CLI presence check the connection flow
 * uses before spending model quota: `parseCliVersion` extracts an `x.y.z`
 * from `--version` output (falling back to trimmed text, then null), and
 * `probeClaudeCli` turns an injected exec's exit code into
 * present/version. A surviving mutant here (the version regex silently
 * matching less/more, the non-zero-exit-code check inverted, or the
 * try/catch swallowing a real success as absent) could misreport the CLI
 * as present when it isn't, or vice versa, breaking the auth-mode picker
 * that depends on it.
 *
 * cli-probe.ts has zero workspace imports (only `node:child_process`) — same
 * low-risk shape as security.ts, no alias needed.
 *
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
export default {
  packageManager: 'pnpm',
  plugins: ['@stryker-mutator/vitest-runner'],
  testRunner: 'vitest',
  vitest: {
    // NOT the root vitest.config.ts — see this file's header for why.
    configFile: 'config/mutation/vitest.dashboard-cli-probe.config.ts',
  },
  mutate: ['apps/dashboard/src/connection/cli-probe.ts'],
  concurrency: 1,
  symlinkNodeModules: false,
  coverageAnalysis: 'perTest',
  // Static mutants are out of scope (2026-09-16). Stryker's own term for a
  // mutant "only executed during the loading of a file": a module-level
  // constant is built once at import, BEFORE a mutant can be activated for a
  // given test, so no test can kill one and writing more would not change
  // that. They are an artifact of WHERE the code runs, not evidence of an
  // untested invariant — the store config's own comment works the case
  // through in full. Mutants inside functions that tests call are unaffected,
  // including functions the module also calls at load time.
  ignoreStatic: true,
  thresholds: { high: 100, low: 100, break: 100 },
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/dashboard-cli-probe/index.html' },
  jsonReporter: { fileName: 'reports/mutation/dashboard-cli-probe/mutation.json' },
  tempDirName: '.stryker-tmp-dashboard-cli-probe',
};
