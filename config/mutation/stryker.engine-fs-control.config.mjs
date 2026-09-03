// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for packages/engine/src/adapters/fs-control.ts (backlog
 * web-msnswvcq-viays2, "MUTATION TESTING") — next after instance-lock.ts
 * (stryker.engine-instance-lock.config.mjs) in
 * `packages/engine/src/adapters/`.
 *
 * `FsControl` is the loop's filesystem control surface: the STOP sentinel
 * check, restart-safe resilience-state round-trip, prompt loading +
 * versioning, and STOP-aware chunked sleep (ENGINE-RESEARCH G7/G10). A
 * surviving mutant here (e.g. `stopRequested` inverted, `numOr0`'s
 * `Number.isFinite` guard dropped so a corrupt state field propagates, or
 * `sleep`'s STOP check silently skipped) could mean a flight ignores an
 * operator's STOP request or resumes with corrupted resilience counters.
 *
 * fs-control.ts's only runtime imports are `node:fs`, `node:crypto`, and
 * `../resilience.js` (a type-only import, erased at compile time), so — like
 * clock.ts and instance-lock.ts before it — this needs no `@autopilot/store`
 * alias, no subprocess, no native binding.
 *
 * The two Windows-specific fixes below were required for the prior configs'
 * narrow scope even without a native addon or subprocess in the mutated file
 * itself — Stryker's sandboxed copy of the tree is enough on its own to trip
 * them — so both carry over here defensively.
 *
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
export default {
  packageManager: 'pnpm',
  plugins: ['@stryker-mutator/vitest-runner'],
  testRunner: 'vitest',
  vitest: {
    // NOT the root vitest.config.ts or packages/engine/test/**'s full suite
    // — see this file's header for why.
    configFile: 'config/mutation/vitest.engine-fs-control.config.ts',
  },
  mutate: ['packages/engine/src/adapters/fs-control.ts'],
  concurrency: 1,
  symlinkNodeModules: false,
  coverageAnalysis: 'perTest',
  thresholds: { high: 100, low: 100, break: 100 },
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/engine-fs-control/index.html' },
  jsonReporter: { fileName: 'reports/mutation/engine-fs-control/mutation.json' },
  tempDirName: '.stryker-tmp-engine-fs-control',
};
