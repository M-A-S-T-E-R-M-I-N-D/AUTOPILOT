// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for packages/onboarding/src/onboard/soul.ts
 * (backlog web-msnswvcq-viays2, "MUTATION TESTING") — sixth onboarding
 * module wired after secret-guard.ts, guard.ts+refs.ts, size-guard.ts,
 * ritual.ts, and task-id.ts (stryker.onboarding-task-id.config.mjs).
 *
 * generateStarterSoul renders the starter SOUL doc — the persona/rules file
 * AUTOPILOT reads every firing — from the detected gate. A surviving mutant
 * here (a dropped section, a flipped `ambiguity === 'multi'` check, or a
 * `gateLine` fallback silently swallowed) would ship a starter SOUL missing
 * doctrine the engine is supposed to carry from firing one.
 *
 * soul.ts's only import is `../gate/types.js` (type-only) — no runtime
 * dependency on `node:fs`, `git`, or better-sqlite3. soul.test.ts drives it
 * through `detectGate` + `makeFsSnapshot`, both pure in-memory fixtures (see
 * gate/snapshot.ts's docstring), so it never touches the sandbox gap
 * documented in stryker.store.config.mjs.
 *
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
export default {
  packageManager: 'pnpm',
  plugins: ['@stryker-mutator/vitest-runner'],
  testRunner: 'vitest',
  vitest: {
    // NOT the root vitest.config.ts — see this file's header for why.
    configFile: 'config/mutation/vitest.onboarding-soul.config.ts',
  },
  mutate: ['packages/onboarding/src/onboard/soul.ts'],
  concurrency: 1,
  symlinkNodeModules: false,
  coverageAnalysis: 'perTest',
  thresholds: { high: 100, low: 100, break: 100 },
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/onboarding-soul/index.html' },
  jsonReporter: { fileName: 'reports/mutation/onboarding-soul/mutation.json' },
  tempDirName: '.stryker-tmp-onboarding-soul',
};
