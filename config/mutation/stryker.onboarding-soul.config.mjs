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
  // The sandbox is a COPY of the repo, and this repo carries ~1.4GB of runtime
  // state (.autopilot: the live SQLite db and every backup) that no test reads,
  // copied once PER CONFIG on a 7200 RPM platter across 103 configs. Stryker
  // documents ignorePatterns for exactly this case: "too many (or too large)
  // files are copied to the sandbox that are not needed to run the tests".
  // .stryker-tmp* is listed because a leftover sandbox otherwise gets copied
  // into the next one — 8.1GB was measured sitting in a single leftover
  // (2026-09-17). Measured effect on one config: startup 75s -> 17s.
  ignorePatterns: ['.autopilot', '.stryker-tmp*', 'reports', 'test-results', 'dist'],
  // cleanTempDir defaults to deleting the sandbox only after a SUCCESSFUL run,
  // so every red config leaves its entire sandbox on disk indefinitely — and
  // most are red while this debt is being cleared.
  cleanTempDir: 'always',
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
  htmlReporter: { fileName: 'reports/mutation/onboarding-soul/index.html' },
  jsonReporter: { fileName: 'reports/mutation/onboarding-soul/mutation.json' },
  tempDirName: '.stryker-tmp-onboarding-soul',
};
