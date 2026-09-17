// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for apps/dashboard/src/flight/verify-by.ts (backlog
 * web-msnswvcq-viays2, "MUTATION TESTING") — next after otlp.ts
 * (stryker.dashboard-otlp.config.mjs), continuing to widen through
 * flight/'s other zero-import pure logic.
 *
 * verify-by.ts parses "## title (..., verify by YYYY-MM-DD...)" headings out
 * of docs/RESEARCH-LIBRARY.md and decides which are due (see its own file
 * header). A surviving mutant here (an off-by-one on the day boundary, a
 * broken heading/date regex, or a flipped sort order) could silently drop a
 * stale research note from the sweep or report it in the wrong priority
 * order.
 *
 * Same shape of good target as otlp.ts: zero imports (a fully self-contained
 * pure module) and exercised with concrete expected-output assertions by
 * verify-by.test.ts.
 *
 * Wiring Stryker here found five real gaps in the heading regex (a missing
 * `^` anchor, a missing trailing `$`, no space required before the
 * parenthetical, and trailing whitespace after it) plus one real gap in the
 * `!title || !parenthetical` guard (a heading that's nothing but whitespace
 * between "##" and its parenthetical) — closed with six new cases in
 * verify-by.test.ts. It also tightened the title capture to require a
 * non-whitespace first character (`\S` instead of a bare `.+?`), which
 * turned an unkillable `\s+` vs `\s` quantifier mutant into a killable one
 * (closed with a two-leading-spaces test) and, as a side effect, made
 * `.trim()` on the title fully redundant (removed) and made the
 * `!title || !parenthetical` guard's outcome unobservable (title can no
 * longer be falsy, and a falsy parenthetical is always caught by the
 * `!verifyByDate` guard right after) — both left as Stryker-disabled
 * TS-narrowing-only code, same pattern as otlp.ts's `eq < 0`.
 *
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
export default {
  packageManager: 'pnpm',
  plugins: ['@stryker-mutator/vitest-runner'],
  testRunner: 'vitest',
  vitest: {
    // related: false — REQUIRED here, not a preference (2026-09-17). Stryker's
    // vitest runner defaults to vitest --related, asking vitest which test files
    // relate to the mutated one. Inside the sandbox (symlinkNodeModules: false,
    // needed for better-sqlite3) that relation cannot always be resolved, and the
    // runner then finds NOTHING: "No tests were executed. Stryker will exit
    // prematurely." This config crashed that way on every nightly — producing no
    // report at all, so the module looked accounted-for while being mutation-tested
    // not at all. Turning related off is safe precisely because the vitest config
    // below already scopes include to exactly the test file this module needs.
    related: false,
    // NOT the root vitest.config.ts — see this file's header for why.
    configFile: 'config/mutation/vitest.dashboard-verify-by.config.ts',
  },
  mutate: ['apps/dashboard/src/flight/verify-by.ts'],
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
  htmlReporter: { fileName: 'reports/mutation/dashboard-verify-by/index.html' },
  jsonReporter: { fileName: 'reports/mutation/dashboard-verify-by/mutation.json' },
  tempDirName: '.stryker-tmp-dashboard-verify-by',
};
