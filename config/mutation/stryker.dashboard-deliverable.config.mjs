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
  concurrency: 1,
  symlinkNodeModules: false,
  coverageAnalysis: 'perTest',
  thresholds: { high: 100, low: 100, break: 100 },
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/dashboard-deliverable/index.html' },
  jsonReporter: { fileName: 'reports/mutation/dashboard-deliverable/mutation.json' },
  tempDirName: '.stryker-tmp-dashboard-deliverable',
};
