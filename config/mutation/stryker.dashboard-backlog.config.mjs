// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for apps/dashboard/src/flight/backlog.ts (backlog
 * web-msnswvcq-viays2, "MUTATION TESTING") — next after epic-spec.ts
 * (stryker.dashboard-epic-spec.config.mjs), continuing to widen through
 * flight/'s other zero-import pure logic.
 *
 * `parseBacklogTitles` is the deterministic backstop for the "proposals
 * dedupe against board AND backlog" doctrine (docs/BACKLOG-999.md §L):
 * fly.ts's harvestProposals uses it to reject a VERBATIM repeat of an
 * existing backlog bullet, since the firing prompt's dedupe instruction
 * alone is not enforcement. A surviving mutant here (a loosened/tightened
 * regex, a dropped `.trim()`, an off-by-one on the capture group) could
 * silently let a duplicate proposal through, or drop a legitimate one.
 *
 * Wiring Stryker here also caught two equivalent mutants baked into the
 * original regex: the trailing `$` was a no-op (each `line` already has no
 * embedded newline for `(.+)` to stop short of) and `\s+`'s `+` only ever
 * shifted extra leading whitespace into the capture, which `.trim()` strips
 * either way — both simplified away (see backlog.ts's own comment) the same
 * way config.ts's redundant `.length > 0` guard was
 * (stryker.dashboard-config.config.mjs). Two real gaps needed new test
 * cases instead: a missing `.trim()` (killed by asserting on trailing
 * whitespace) and a missing `^` anchor (killed by a line with the checkbox
 * marker embedded mid-string instead of starting it).
 *
 * Same shape of good target as epic-spec.ts: zero imports (a fully
 * self-contained pure module — see the module's own file header) and now
 * exercised with concrete expected-output assertions by backlog.test.ts
 * covering matched checkbox items, ignored prose/headings, non-appended
 * continuation lines, the empty-document case, trailing-whitespace
 * trimming, and marker-not-at-line-start rejection — so it sidesteps the
 * better-sqlite3-in-sandbox gap documented in stryker.store.config.mjs.
 *
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
export default {
  packageManager: 'pnpm',
  plugins: ['@stryker-mutator/vitest-runner'],
  testRunner: 'vitest',
  vitest: {
    // NOT the root vitest.config.ts — see this file's header for why.
    configFile: 'config/mutation/vitest.dashboard-backlog.config.ts',
  },
  mutate: ['apps/dashboard/src/flight/backlog.ts'],
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
  htmlReporter: { fileName: 'reports/mutation/dashboard-backlog/index.html' },
  jsonReporter: { fileName: 'reports/mutation/dashboard-backlog/mutation.json' },
  tempDirName: '.stryker-tmp-dashboard-backlog',
};
