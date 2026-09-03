// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for packages/engine/src/adapters/clock.ts (backlog
 * web-msnswvcq-viays2, "MUTATION TESTING") — the twenty-second module wired,
 * second from `packages/engine/src/adapters/` after remediating-gate.ts
 * (stryker.engine-remediating-gate.config.mjs).
 *
 * `SystemClock` is the real-clock `ClockPort` implementation injected
 * everywhere the engine needs "now" (firing timestamps, pacer windows,
 * telemetry rows) so the rest of the engine can stay deterministic under
 * fakes. It had NO dedicated test file before this change — only indirect
 * exercise via `packages/engine/test/e2e/sandbox.test.ts` — despite feeding
 * every un-fakeable timestamp the engine records. A surviving mutant here
 * (e.g. `Math.floor` dropped from `nowEpochSec`, or `/ 1000` flipped to
 * `* 1000`) could silently corrupt every epoch-second value the engine
 * persists.
 *
 * clock.ts's only import is `../ports.js`, `import type` and erased at
 * compile time, so — like remediating-gate.ts before it — this needs no
 * `@autopilot/store` alias, no subprocess, no native binding.
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
    configFile: 'config/mutation/vitest.engine-clock.config.ts',
  },
  mutate: ['packages/engine/src/adapters/clock.ts'],
  concurrency: 1,
  symlinkNodeModules: false,
  coverageAnalysis: 'perTest',
  thresholds: { high: 100, low: 100, break: 100 },
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/engine-clock/index.html' },
  jsonReporter: { fileName: 'reports/mutation/engine-clock/mutation.json' },
  tempDirName: '.stryker-tmp-engine-clock',
};
