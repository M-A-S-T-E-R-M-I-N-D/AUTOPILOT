// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for apps/dashboard/src/connection/login.ts (backlog
 * web-msnswvcq-viays2, "MUTATION TESTING") — next after connection/cli-probe.ts
 * (stryker.dashboard-cli-probe.config.mjs), continuing to widen through
 * connection/'s pure logic.
 *
 * login.ts picks the per-platform terminal command that launches the
 * official `claude` CLI login (or `claude setup-token`) — the OAuth flow
 * itself is owned by the CLI, not this code. A surviving mutant here (the
 * win32/darwin branch check flipped, the setup-token vs login command
 * swapped, or the spawn options/error-swallowing changed) could silently
 * launch the wrong login command or crash the button handler instead of
 * failing gracefully.
 *
 * login.ts has zero workspace imports (only `node:child_process`) — same
 * low-risk shape as cli-probe.ts, no alias needed.
 *
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
export default {
  packageManager: 'pnpm',
  plugins: ['@stryker-mutator/vitest-runner'],
  testRunner: 'vitest',
  vitest: {
    // NOT the root vitest.config.ts — see this file's header for why.
    configFile: 'config/mutation/vitest.dashboard-login.config.ts',
  },
  mutate: ['apps/dashboard/src/connection/login.ts'],
  concurrency: 1,
  symlinkNodeModules: false,
  coverageAnalysis: 'perTest',
  thresholds: { high: 100, low: 100, break: 100 },
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/dashboard-login/index.html' },
  jsonReporter: { fileName: 'reports/mutation/dashboard-login/mutation.json' },
  tempDirName: '.stryker-tmp-dashboard-login',
};
