// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for packages/engine/src/adapters/instance-lock.ts
 * (backlog web-msnswvcq-viays2, "MUTATION TESTING") — next after clock.ts
 * (stryker.engine-clock.config.mjs) in `packages/engine/src/adapters/`.
 *
 * `FileInstanceLock` is the per-project single-instance guard that keeps two
 * flights from racing the same target repo (PARALLEL FLIGHTS 1/6,
 * docs/epics/0001-parallel-flights.md) — every acquire/release/staleness
 * decision it makes is safety-critical: a surviving mutant here (e.g. the
 * EEXIST check silently accepting any error, or `isLockStale`'s negation
 * flipped) could let two engines write the same target concurrently with no
 * visible failure.
 *
 * instance-lock.ts's only import is `node:fs`, so — like clock.ts before it
 * — this needs no `@autopilot/store` alias, no subprocess, no native
 * binding.
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
    configFile: 'config/mutation/vitest.engine-instance-lock.config.ts',
  },
  mutate: ['packages/engine/src/adapters/instance-lock.ts'],
  concurrency: 1,
  symlinkNodeModules: false,
  coverageAnalysis: 'perTest',
  thresholds: { high: 100, low: 100, break: 100 },
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/engine-instance-lock/index.html' },
  jsonReporter: { fileName: 'reports/mutation/engine-instance-lock/mutation.json' },
  tempDirName: '.stryker-tmp-engine-instance-lock',
};
