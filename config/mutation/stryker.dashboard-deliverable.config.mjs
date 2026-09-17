// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for apps/dashboard/src/flight/deliverable.ts (backlog
 * web-msnswvcq-viays2, "MUTATION TESTING") — next after inbox.ts
 * (stryker.dashboard-inbox.config.mjs), continuing to widen through
 * flight/'s other zero-import pure logic.
 *
 * deliverable.ts is the DELIVERABLE-clause verifier and UX-EXPRESSION
 * DOCTRINE check (see its own file header): it decides whether a firing's
 * self-reported "complete" claim is backed by the shipping patch actually
 * mentioning what it says it delivers, and whether a UX-promising claim
 * touches a real UI/Docs surface. A surviving mutant here (a stopword
 * silently dropped from filtering, the plural-tolerance strip broken, or
 * the web/-path check loosened) would let an unbacked "complete" claim
 * close a task without ever being contradicted.
 *
 * Same shape of good target as inbox.ts: zero imports (a fully
 * self-contained pure module) and exercised with concrete expected-output
 * assertions by deliverable.test.ts.
 *
 * Wiring Stryker here found real gaps and two equivalent-mutant families.
 * The gaps: every entry in STOPWORDS and UX_SIGNAL_WORDS was untested in
 * isolation (only a handful of words ever appeared in a test string), so
 * deleting any one of the ~70 unexercised words silently survived — closed
 * with one it.each case per word instead of trusting a few sampled
 * sentences. Also untested: keywordMatches's direct-literal-match branch (a
 * clause word present verbatim, not via the plural fallback), its guard
 * against stripping a trailing letter off a non-plural word, the 4-char
 * floor on a stripped singular (both above and below the boundary), the
 * `^`-anchored diff-header requirement (a stray "diff --git" mid-line must
 * not count), and touchesUserFacingSurface's `docs/` + `.md` requirement
 * needing BOTH halves (a top-level .md outside docs/, or a non-.md file
 * inside docs/, must each fail alone).
 *
 * The equivalent mutants: deliverableKeywords' and promisesUxExpression's
 * `.split(/[^a-z0-9]+/)` used a `+` quantifier merging runs of separators,
 * but both callers already discard the empty tokens a run produces (the
 * `length >= 4` filter, or promisesUxExpression's now-removed
 * `.filter(Boolean)` — itself dead for the same reason: no word in
 * UX_SIGNAL_WORDS is empty) — so a single-char class produces identical
 * results and the `+` was simplified away in both. touchedFiles' manual
 * `while ((m = re.exec(patch)) !== null)` loop with an `m[1] !== undefined`
 * guard around the push was replaced with `Array.from(patch.matchAll(re),
 * (m) => m[1]!)`: the guard was permanently true (the regex's `(\S+)` group
 * is mandatory, so a successful match always populates it) and existed only
 * to satisfy TypeScript, not runtime behavior — the `!` says that directly
 * instead of hiding it behind an unkillable branch.
 *
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
export default {
  packageManager: 'pnpm',
  plugins: ['@stryker-mutator/vitest-runner'],
  testRunner: 'vitest',
  vitest: {
    // NOT the root vitest.config.ts — see this file's header for why.
    configFile: 'config/mutation/vitest.dashboard-deliverable.config.ts',
  },
  mutate: ['apps/dashboard/src/flight/deliverable.ts'],
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
  htmlReporter: { fileName: 'reports/mutation/dashboard-deliverable/index.html' },
  jsonReporter: { fileName: 'reports/mutation/dashboard-deliverable/mutation.json' },
  tempDirName: '.stryker-tmp-dashboard-deliverable',
};
