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
    // NOT the root vitest.config.ts — see this file's header for why.
    configFile: 'config/mutation/vitest.dashboard-verify-by.config.ts',
  },
  mutate: ['apps/dashboard/src/flight/verify-by.ts'],
  concurrency: 1,
  symlinkNodeModules: false,
  coverageAnalysis: 'perTest',
  thresholds: { high: 100, low: 100, break: 100 },
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/dashboard-verify-by/index.html' },
  jsonReporter: { fileName: 'reports/mutation/dashboard-verify-by/mutation.json' },
  tempDirName: '.stryker-tmp-dashboard-verify-by',
};
