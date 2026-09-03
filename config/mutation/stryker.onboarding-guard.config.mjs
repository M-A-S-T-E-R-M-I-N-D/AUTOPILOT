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
  concurrency: 1,
  symlinkNodeModules: false,
  coverageAnalysis: 'perTest',
  thresholds: { high: 100, low: 100, break: 100 },
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/onboarding-guard/index.html' },
  jsonReporter: { fileName: 'reports/mutation/onboarding-guard/mutation.json' },
  tempDirName: '.stryker-tmp-onboarding-guard',
};
