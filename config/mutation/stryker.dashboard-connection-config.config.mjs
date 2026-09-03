// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for apps/dashboard/src/connection/config.ts (backlog
 * web-msnswvcq-viays2, "MUTATION TESTING") — next after connection/verify.ts
 * (stryker.dashboard-verify.config.mjs), continuing to widen through
 * connection/'s pure logic.
 *
 * config.ts persists the operator's Claude auth choice: `readConnectionConfig`
 * decides what a missing/corrupt/foreign-shaped file degrades to (always the
 * secret-free subscription default), and `writeConnectionConfig` writes it
 * git-ignored and best-effort 0600. A surviving mutant here (the unknown-mode
 * fallback silently accepting an unrecognized mode, `apiKey`/`oauthToken`
 * carried through as `undefined` instead of omitted, or the chmod failure
 * catch turned into a throw that crashes a POSIX-perm-less platform) could
 * mis-persist which credential mode is active or break config writes outright.
 *
 * Same shape of good target as verify.ts: only workspace import is
 * `@autopilot/engine`'s zero-import `auth.ts` (aliased in the vitest config
 * below), exercised with concrete expected-output assertions.
 *
 * 100% achieved with one genuine equivalent mutant excluded inline (config.ts,
 * `isAuthMode`): `.includes()` uses strict equality against a string array, so
 * a non-string value can never match regardless of the `typeof value ===
 * 'string'` guard — that check only serves TypeScript's narrowing, removing it
 * is a runtime no-op. Everything else needed real test coverage: the
 * pre-existing test file only exercised the corrupt-file and unknown-mode
 * paths, leaving `apiKey`/`oauthToken` presence-vs-omission, the
 * existsSync-lies-relative-to-a-readable-file branch, and the write-side
 * `{ mode: 0o600 }` / chmodSync call unasserted.
 *
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
export default {
  packageManager: 'pnpm',
  plugins: ['@stryker-mutator/vitest-runner'],
  testRunner: 'vitest',
  vitest: {
    // NOT the root vitest.config.ts — see this file's header for why.
    configFile: 'config/mutation/vitest.dashboard-connection-config.config.ts',
  },
  mutate: ['apps/dashboard/src/connection/config.ts'],
  concurrency: 1,
  symlinkNodeModules: false,
  coverageAnalysis: 'perTest',
  thresholds: { high: 100, low: 100, break: 100 },
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/dashboard-connection-config/index.html' },
  jsonReporter: { fileName: 'reports/mutation/dashboard-connection-config/mutation.json' },
  tempDirName: '.stryker-tmp-dashboard-connection-config',
};
