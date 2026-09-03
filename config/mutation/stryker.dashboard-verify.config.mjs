// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for apps/dashboard/src/connection/verify.ts (backlog
 * web-msnswvcq-viays2, "MUTATION TESTING") — next after ritual-lock.ts
 * (stryker.dashboard-ritual-lock.config.mjs), continuing to widen through
 * connection/'s pure logic.
 *
 * verify.ts is the dashboard's whole "are we actually logged in" story:
 * credentialsFilePath()/hasStoredLogin() decide which OS-specific path to
 * probe (and when to honestly report "can't tell" on macOS Keychain), and
 * verifyClaudeAuth() is the definitive interpreter of a real `claude -p`
 * envelope. A surviving mutant here (e.g. `!envelope.isError` flipped to
 * `envelope.isError`, the win32/darwin branch swapped, or the try/catch
 * silently swallowed into "authenticated: true") could tell a user they're
 * logged in when they aren't, or vice versa — exactly the class of bug this
 * doctrine exists to catch mechanically instead of by hand.
 *
 * Only non-relative import is `@autopilot/engine`'s `parseModelEnvelope` —
 * aliased in the vitest config below straight to the leaf module that
 * defines it (same workaround as ritual-lock.ts's `FileInstanceLock`).
 *
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
export default {
  packageManager: 'pnpm',
  plugins: ['@stryker-mutator/vitest-runner'],
  testRunner: 'vitest',
  vitest: {
    // NOT the root vitest.config.ts — see this file's header for why.
    configFile: 'config/mutation/vitest.dashboard-verify.config.ts',
  },
  mutate: ['apps/dashboard/src/connection/verify.ts'],
  concurrency: 1,
  symlinkNodeModules: false,
  coverageAnalysis: 'perTest',
  thresholds: { high: 100, low: 100, break: 100 },
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/dashboard-verify/index.html' },
  jsonReporter: { fileName: 'reports/mutation/dashboard-verify/mutation.json' },
  tempDirName: '.stryker-tmp-dashboard-verify',
};
