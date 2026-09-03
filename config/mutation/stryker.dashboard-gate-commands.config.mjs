// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for apps/dashboard/src/gate-commands.ts (backlog
 * web-msnswvcq-viays2, "MUTATION TESTING") — continuing to widen through
 * apps/dashboard/src's zero-side-effect pure logic.
 *
 * gateCommands() is the ONE place a project's flat GateSpec becomes a
 * runnable command list — both a live flight (fly.ts) and a LANDING
 * EXECUTE (landing/execute.ts) gate through it, so the two paths can't
 * drift apart (epic 0002 "shell decomposition", slice 1). A surviving
 * mutant here (a dropped gate kind, the typecheck/lint/format parallel set
 * widened or narrowed, the args array aliased instead of copied so a
 * caller's mutation leaks into the command list, or a bin-presence check
 * inverted so an unconfigured kind still runs) could silently skip a real
 * gate check or corrupt the shared command list across concurrent flights.
 *
 * gate-commands.ts's only import is a type (`GateSpec`, erased at compile
 * time) — zero runtime imports, same low-risk shape as registry.ts/
 * runner.ts, never touches the better-sqlite3-in-sandbox gap documented in
 * stryker.store.config.mjs.
 *
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
export default {
  packageManager: 'pnpm',
  plugins: ['@stryker-mutator/vitest-runner'],
  testRunner: 'vitest',
  vitest: {
    // NOT the root vitest.config.ts — see this file's header for why.
    configFile: 'config/mutation/vitest.dashboard-gate-commands.config.ts',
  },
  mutate: ['apps/dashboard/src/gate-commands.ts'],
  concurrency: 1,
  symlinkNodeModules: false,
  coverageAnalysis: 'perTest',
  thresholds: { high: 100, low: 100, break: 100 },
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/dashboard-gate-commands/index.html' },
  jsonReporter: { fileName: 'reports/mutation/dashboard-gate-commands/mutation.json' },
  tempDirName: '.stryker-tmp-dashboard-gate-commands',
};
