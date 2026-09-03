// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for packages/engine/src/adapters/gate.ts (backlog
 * web-msnswvcq-viays2, "MUTATION TESTING") — next after fs-control.ts
 * (stryker.engine-fs-control.config.mjs) in
 * `packages/engine/src/adapters/`.
 *
 * `GateRunner` is the verification gate every commit passes through: it
 * runs the detected gate commands (typecheck/test/build/…) in order,
 * fails fast on the first non-zero exit, and batches consecutive
 * `parallel: true` commands. A surviving mutant here (e.g. `pass: r.code
 * === 0` inverted, the fail-fast `find` swapped for something that keeps
 * going past a failure, or `buildInvocation`'s Windows shim-detection
 * regex loosened) could mean AUTOPILOT ships a commit whose gate never
 * actually ran, or silently skips the cmd.exe shim a real tool needs to
 * launch on Windows.
 *
 * gate.ts's only runtime imports are `node:child_process` and
 * `../ports.js` (a type-only import, erased at compile time), so — like
 * clock.ts, instance-lock.ts, and fs-control.ts before it — this needs no
 * `@autopilot/store` alias. Unlike those three, gate.test.ts does spawn a
 * few REAL short-lived subprocesses (`node --version`, a missing binary)
 * through the default `execFile` seam rather than exclusively injecting a
 * scripted `GateExec` fake — each completes in well under a second, so
 * this stays far short of git.ts's ~300-700ms-per-test subprocess cost
 * that keeps git.ts excluded from this widening effort for now.
 *
 * The two Windows-specific fixes below were required for the prior
 * configs' narrow scope even without a native addon in the mutated file
 * itself — Stryker's sandboxed copy of the tree is enough on its own to
 * trip them — so both carry over here defensively.
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
    configFile: 'config/mutation/vitest.engine-gate.config.ts',
  },
  mutate: ['packages/engine/src/adapters/gate.ts'],
  concurrency: 1,
  symlinkNodeModules: false,
  coverageAnalysis: 'perTest',
  thresholds: { high: 100, low: 100, break: 100 },
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/engine-gate/index.html' },
  jsonReporter: { fileName: 'reports/mutation/engine-gate/mutation.json' },
  tempDirName: '.stryker-tmp-engine-gate',
};
