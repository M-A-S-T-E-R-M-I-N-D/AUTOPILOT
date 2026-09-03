// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for apps/dashboard/src/server/rate-limit.ts (backlog
 * web-msnswvcq-viays2, "MUTATION TESTING") — continuing to widen through
 * apps/dashboard/src's zero-side-effect pure logic.
 *
 * createRateLimiter() is the fixed-window rate limiter guarding
 * quota-spending endpoints (/api/ask, /api/ask/stream) against a runaway
 * loop from a single client. A surviving mutant here (an off-by-one on the
 * window boundary, `>=` swapped for `>` on the limit check, a denied call
 * silently consuming budget, or windows keyed together instead of per-client)
 * could let a runaway client burn quota unchecked or wrongly lock out a
 * well-behaved one.
 *
 * rate-limit.ts has zero runtime imports — same low-risk shape as
 * gate-commands.ts/registry.ts/runner.ts, never touches the
 * better-sqlite3-in-sandbox gap documented in stryker.store.config.mjs.
 *
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
export default {
  packageManager: 'pnpm',
  plugins: ['@stryker-mutator/vitest-runner'],
  testRunner: 'vitest',
  vitest: {
    // NOT the root vitest.config.ts — see this file's header for why.
    configFile: 'config/mutation/vitest.dashboard-rate-limit.config.ts',
  },
  mutate: ['apps/dashboard/src/server/rate-limit.ts'],
  concurrency: 1,
  symlinkNodeModules: false,
  coverageAnalysis: 'perTest',
  thresholds: { high: 100, low: 100, break: 100 },
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/dashboard-rate-limit/index.html' },
  jsonReporter: { fileName: 'reports/mutation/dashboard-rate-limit/mutation.json' },
  tempDirName: '.stryker-tmp-dashboard-rate-limit',
};
