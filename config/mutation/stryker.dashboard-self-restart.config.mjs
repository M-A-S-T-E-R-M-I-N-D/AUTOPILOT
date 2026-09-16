// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for apps/dashboard/src/landing/self-restart.ts (backlog
 * web-msnswvcq-viays2, "MUTATION TESTING") — next after ask/service.ts.
 * landing/execute.ts and release/execute.ts were both ruled out (each calls
 * `openStore` directly, hitting the documented better-sqlite3
 * sandbox-resolution gap, see stryker.store.config.mjs's header); so were
 * inbox/add.ts, flight/inbox-triage.ts, and control/land-watchdog.ts (same
 * gap, verified against their test files). self-restart.ts has zero
 * workspace-package imports — `spawn` (node:child_process) and the already
 * mutation-tested `../ready.js` only — with every other collaborator
 * (BuildRunner, RestartTarget, verifyHealth, exit) injected, so it never
 * touches the gap at all.
 *
 * createSelfRestartTrigger sequences the self-hosting rebuild+restart after a
 * LANDING merge (MASTER-PLAN §18.1): release the port THIS process holds,
 * THEN spawn the replacement, THEN verify it actually answers before exiting.
 * A surviving mutant here (the stopSelf-before-start ordering swapped, the
 * portReleased guard flipped, an exit code inverted) could re-introduce the
 * exact bug this module's header describes fixing — the respawned server
 * never binds and nobody is left listening.
 *
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
export default {
  packageManager: 'pnpm',
  plugins: ['@stryker-mutator/vitest-runner'],
  testRunner: 'vitest',
  vitest: {
    // NOT the root vitest.config.ts — see this file's header for why.
    configFile: 'config/mutation/vitest.dashboard-self-restart.config.ts',
  },
  mutate: ['apps/dashboard/src/landing/self-restart.ts'],
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
  htmlReporter: { fileName: 'reports/mutation/dashboard-self-restart/index.html' },
  jsonReporter: { fileName: 'reports/mutation/dashboard-self-restart/mutation.json' },
  tempDirName: '.stryker-tmp-dashboard-self-restart',
};
