// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for apps/dashboard/src/server/security.ts (backlog
 * web-msnswvcq-viays2, "MUTATION TESTING") — continuing to widen through
 * apps/dashboard/src's zero-side-effect pure logic.
 *
 * securityHeaders() and isAllowedHost() are the localhost dashboard's whole
 * hardening posture: a strict CSP with no `unsafe-inline`, and the
 * DNS-rebind guard that refuses to answer a request whose Host header isn't
 * a loopback name. A surviving mutant here (a loosened CSP directive, `===`
 * flipped to `!==` in isAllowedHost, the bracketed-IPv6 regex silently
 * matching more than intended, or a dropped header) could let a malicious
 * page on the public internet rebind DNS to reach this loopback-only
 * server, or weaken the CSP protecting it.
 *
 * security.ts has zero runtime imports — same low-risk shape as
 * gate-commands.ts/registry.ts/runner.ts, never touches the
 * better-sqlite3-in-sandbox gap documented in stryker.store.config.mjs.
 * Its tests previously lived inside routes.test.ts (`describe('security',
 * ...)`) alongside the unrelated handleRoute tests; moved to a dedicated
 * security.test.ts (importing only security.ts) so this config doesn't drag
 * in routes.ts's `@autopilot/tokens` workspace specifier, which isn't
 * resolvable inside Stryker's sandboxed copy (symlinkNodeModules: false,
 * same root cause documented in vitest.dashboard-lock.config.ts) and made
 * Vitest's `--related` dry run report "No tests were found".
 *
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
export default {
  packageManager: 'pnpm',
  plugins: ['@stryker-mutator/vitest-runner'],
  testRunner: 'vitest',
  vitest: {
    // NOT the root vitest.config.ts — see this file's header for why.
    configFile: 'config/mutation/vitest.dashboard-security.config.ts',
  },
  mutate: ['apps/dashboard/src/server/security.ts'],
  concurrency: 1,
  symlinkNodeModules: false,
  coverageAnalysis: 'perTest',
  thresholds: { high: 100, low: 100, break: 100 },
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/dashboard-security/index.html' },
  jsonReporter: { fileName: 'reports/mutation/dashboard-security/mutation.json' },
  tempDirName: '.stryker-tmp-dashboard-security',
};
