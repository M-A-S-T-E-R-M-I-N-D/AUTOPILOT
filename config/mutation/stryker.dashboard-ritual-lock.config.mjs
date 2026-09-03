// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for apps/dashboard/src/flight/ritual-lock.ts (backlog
 * web-msnswvcq-viays2, "MUTATION TESTING") — next after lock.ts
 * (stryker.dashboard-lock.config.mjs), continuing to widen through
 * flight/'s other pure logic.
 *
 * withRitualLock serializes flight-end rituals (self-study regen + commit)
 * across processes so two flights ending at the same moment never race the
 * same `git commit` in this checkout's working tree. A surviving mutant
 * (e.g. flipping the stale-retry condition, or skipping `lock.release()` in
 * the `finally`) could silently reopen that race or leak a lock forever.
 *
 * Only import is `@autopilot/engine`'s `FileInstanceLock` (pure, already
 * unit-tested there) — nothing to mock.
 *
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
export default {
  packageManager: 'pnpm',
  plugins: ['@stryker-mutator/vitest-runner'],
  testRunner: 'vitest',
  vitest: {
    // NOT the root vitest.config.ts — see this file's header for why.
    configFile: 'config/mutation/vitest.dashboard-ritual-lock.config.ts',
  },
  mutate: ['apps/dashboard/src/flight/ritual-lock.ts'],
  concurrency: 1,
  symlinkNodeModules: false,
  coverageAnalysis: 'perTest',
  thresholds: { high: 100, low: 100, break: 100 },
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/dashboard-ritual-lock/index.html' },
  jsonReporter: { fileName: 'reports/mutation/dashboard-ritual-lock/mutation.json' },
  tempDirName: '.stryker-tmp-dashboard-ritual-lock',
};
