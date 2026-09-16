// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for apps/dashboard/src/flight/inbox.ts (backlog
 * web-msnswvcq-viays2, "MUTATION TESTING") — next after backlog.ts
 * (stryker.dashboard-backlog.config.mjs), continuing to widen through
 * flight/'s other zero-import pure logic.
 *
 * `selectInboxFiles` is the pure decision half of the operator's INBOX/
 * loop (see inbox.ts's own file header): fly.ts does the impure directory
 * read, and hands the raw names here to decide which ones actually count
 * as operator notes for a firing to read. A surviving mutant here (the
 * README exclusion silently dropped, `.toLowerCase()` removed so
 * `README.md` slips through, or the sort silently disabled) would either
 * feed the operator's own convention doc back to a firing as if it were a
 * note, or make firing-to-firing inbox ordering nondeterministic.
 *
 * Same shape of good target as backlog.ts: zero imports (a fully
 * self-contained pure module) and exercised with concrete expected-output
 * assertions by the pre-existing inbox.test.ts, covering sorting,
 * case-insensitive README exclusion, dotfile exclusion, and the
 * empty/all-ignored-folder case.
 *
 * Wiring Stryker here caught two equivalent mutants: `IGNORED_INBOX_FILES`
 * listing `.gitkeep` was dead weight since the dotfile check
 * (`!name.startsWith('.')`) already excludes it under every casing, and the
 * `.slice()` before `.sort()` protected nothing because `.filter()` already
 * returns a fresh array for `.sort()` to mutate in place — both simplified
 * away (see inbox.ts's own diff) the same way backlog.ts's redundant regex
 * anchor was (stryker.dashboard-backlog.config.mjs). One real gap needed a
 * new test case instead: nothing asserted the caller's input array survived
 * unmutated, now covered by inbox.test.ts's "does not mutate the
 * caller-supplied array".
 *
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
export default {
  packageManager: 'pnpm',
  plugins: ['@stryker-mutator/vitest-runner'],
  testRunner: 'vitest',
  vitest: {
    // NOT the root vitest.config.ts — see this file's header for why.
    configFile: 'config/mutation/vitest.dashboard-inbox.config.ts',
  },
  mutate: ['apps/dashboard/src/flight/inbox.ts'],
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
  htmlReporter: { fileName: 'reports/mutation/dashboard-inbox/index.html' },
  jsonReporter: { fileName: 'reports/mutation/dashboard-inbox/mutation.json' },
  tempDirName: '.stryker-tmp-dashboard-inbox',
};
