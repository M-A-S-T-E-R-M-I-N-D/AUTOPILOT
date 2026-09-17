// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for packages/onboarding/src/backup/guard.ts + refs.ts
 * (backlog web-msnswvcq-viays2, "MUTATION TESTING") — second onboarding
 * module wired after secret-guard.ts
 * (stryker.onboarding-secret-guard.config.mjs).
 *
 * assertBackedUp (guard.ts) is the cardinal-rule guard the engine calls
 * before its first firing: no project is ever touched before it carries the
 * MYTH+LEGACY snapshot. isBackedUp (refs.ts) is the boolean it delegates to
 * — `(await vcs.tagExists(MYTH_TAG)) && (await vcs.tagExists(LEGACY_TAG))`.
 * A surviving mutant here (the `&&` flipped to `||`, or either tag constant
 * silently changed) would mean AUTOPILOT starts firing against an unbacked
 * repo. Wiring it surfaced exactly that gap: the existing suite exercised
 * only the 0-of-2 and 2-of-2 tag states (via a full `lockRepo` ritual), never
 * the 1-of-2 partial states that would catch an `&&`/`||` mutation — closed
 * by adding "only MYTH" / "only LEGACY" fixtures.
 *
 * guard.ts's only runtime import is `../backup/errors.js` (type-only-ish,
 * throws a plain Error subclass) and refs.ts's is `./types.js` (type-only) —
 * neither reaches better-sqlite3 or `@autopilot/store`. guard.test.ts itself
 * exercises them through GitBackup (real `git` subprocess against disposable
 * tmpdir repos, same shape as stryker.engine-git.config.mjs) — `git` is a
 * system binary already on PATH inside Stryker's sandbox, nothing
 * workspace-scoped to copy in.
 *
 * The two Windows-specific fixes below were required for the prior configs'
 * narrow scope even without a native addon in the mutated files themselves —
 * Stryker's sandboxed copy of the tree is enough on its own to trip them —
 * so both carry over here defensively.
 *
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
export default {
  packageManager: 'pnpm',
  plugins: ['@stryker-mutator/vitest-runner'],
  testRunner: 'vitest',
  vitest: {
    // NOT the root vitest.config.ts — see this file's header for why.
    configFile: 'config/mutation/vitest.onboarding-guard.config.ts',
  },
  mutate: ['packages/onboarding/src/backup/guard.ts', 'packages/onboarding/src/backup/refs.ts'],
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
  htmlReporter: { fileName: 'reports/mutation/onboarding-guard/index.html' },
  jsonReporter: { fileName: 'reports/mutation/onboarding-guard/mutation.json' },
  tempDirName: '.stryker-tmp-onboarding-guard',
};
