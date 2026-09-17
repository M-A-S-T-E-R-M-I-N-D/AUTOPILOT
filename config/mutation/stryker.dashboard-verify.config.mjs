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
  // The sandbox is a COPY of the repo, and this repo carries ~1.4GB of runtime
  // state (.autopilot: the live SQLite db and every backup) that no test reads,
  // copied once PER CONFIG on a 7200 RPM platter across 103 configs. Stryker
  // documents ignorePatterns for exactly this case: "too many (or too large)
  // files are copied to the sandbox that are not needed to run the tests".
  // .stryker-tmp* is listed because a leftover sandbox otherwise gets copied
  // into the next one — 8.1GB was measured sitting in a single leftover
  // (2026-09-17). Measured effect on one config: startup 75s -> 17s.
  ignorePatterns: ['.autopilot', '.stryker-tmp*', 'reports', 'test-results', 'dist'],
  // cleanTempDir defaults to deleting the sandbox only after a SUCCESSFUL run,
  // so every red config leaves its entire sandbox on disk indefinitely — and
  // most are red while this debt is being cleared.
  cleanTempDir: 'always',
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
  htmlReporter: { fileName: 'reports/mutation/dashboard-verify/index.html' },
  jsonReporter: { fileName: 'reports/mutation/dashboard-verify/mutation.json' },
  tempDirName: '.stryker-tmp-dashboard-verify',
};
