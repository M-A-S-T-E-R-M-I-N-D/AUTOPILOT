// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for packages/store (backlog web-msnswvcq-viays2,
 * "MUTATION TESTING") — the un-fakeable measure of test QUALITY: a suite can
 * hit 80% line coverage while asserting nothing (call the function, check
 * nothing) and this coverage gate would stay green. Stryker mutates the real
 * source (flips conditionals, off-by-ones, swapped operators, …) and reruns
 * the suite; a mutant that SURVIVES means some line changed behavior and no
 * test noticed.
 *
 * Wired into `verify` (package.json) via `thresholds.break` below — a real
 * gate, not just a report: any mutant introduced on rank.ts/schema.ts that
 * survives the suite fails `pnpm run verify`. The rank.ts survivors this
 * slice found (genuine assertion gaps — the fusion output was never checked
 * for sort ORDER, only membership) got real test coverage rather than a
 * loosened threshold; see `reciprocalRankFusion returns results sorted by
 * score descending` in rank.test.ts.
 *
 * Still narrow — `mutate` below covers only rank.ts and schema.ts, not all
 * of packages/store/src, and packages/engine isn't wired at all yet. Widening
 * scope is a follow-up slice, blocked on two compounding reasons:
 *
 * 1. packages/engine's GitVcs tests shell out to real `git` subprocesses per
 *    test (~300-700ms each) — full mutation coverage there would run
 *    minutes-to-hours. Left for a follow-up slice entirely.
 *
 * 2. Within packages/store, every mutant in a module whose tests open a real
 *    better-sqlite3 connection (db.ts, dora.ts, migrate.ts, mutate.ts,
 *    read.ts, search.ts, snapshot.ts, vector.ts) reports [NoCoverage] no
 *    matter the `coverageAnalysis` mode (verified 'perTest', 'all', and
 *    'off' all produce IDENTICAL kill/survive numbers — so this isn't a
 *    per-test attribution quirk, the base coverage COLLECTION itself never
 *    observes those files executing). rank.ts and schema.ts are the only two
 *    store modules whose tests never call `openStore` — and they mutation-test
 *    cleanly (rank.ts 80.95%, schema.ts 100%, see reports/mutation/store/).
 *
 *    Root cause ISOLATED (web-msnswvcq-viays2, attempted widening to
 *    adapters/pacer.ts): `symlinkNodeModules: false` makes Stryker copy only
 *    the REPO ROOT's `node_modules` into each sandbox — `better-sqlite3`
 *    isn't hoisted there (pnpm keeps it workspace-scoped at
 *    `packages/store/node_modules/better-sqlite3`, verified absent from
 *    `node_modules/better-sqlite3` at the repo root), and nested per-package
 *    `node_modules` directories are never copied into the sandbox at all
 *    (verified: a fresh sandbox's `node_modules/` contains only Vite's own
 *    `.vite` cache dir). Any file that reaches `packages/store/src/db.ts`
 *    inside a sandbox throws `Failed to load url better-sqlite3 ... Does
 *    the file exist?` before a single test runs; rank.ts/schema.ts stay
 *    green only because their tests never import it, so the overall dry run
 *    still nets a nonzero test count from them and Stryker doesn't error
 *    out. `symlinkNodeModules: true` was already ruled out (see above:
 *    Windows STATUS_ACCESS_VIOLATION); a real fix needs Stryker to also
 *    materialize nested workspace-package `node_modules` into the sandbox,
 *    which this version's config surface (no `files` override, per the
 *    schema) can't express. Widening `mutate` to the rest of store's
 *    modules — and to `packages/engine/src/adapters/pacer.ts` /
 *    `adapters/store.ts`, both of which hit this identically via their
 *    `@autopilot/store` import — is the next slice, once that gap has an
 *    actual fix (or an upstream Stryker issue confirms it).
 *
 * Both of the crash/config fixes below WERE required even for this narrow
 * scope, because Stryker's dry run still executes every test file matching
 * vitest.store.config.ts's `include` (all of packages/store/test/), not just
 * the ones covering mutated files.
 *
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
export default {
  packageManager: 'pnpm',
  // pnpm's non-flat node_modules means Stryker's default plugin glob
  // (`@stryker-mutator/*`) doesn't reliably resolve the vitest runner —
  // list it explicitly rather than relying on auto-discovery.
  plugins: ['@stryker-mutator/vitest-runner'],
  testRunner: 'vitest',
  vitest: {
    // NOT the root vitest.config.ts — pointing this at the root config
    // pulls in the whole 1353-test monorepo suite (including
    // packages/engine's real-git-subprocess tests) inside Stryker's
    // sandboxed copy of the tree, which crashed the vitest worker outright.
    configFile: 'config/mutation/vitest.store.config.ts',
  },
  mutate: ['packages/store/src/rank.ts', 'packages/store/src/schema.ts'],
  // Concurrent test-runner processes racing to load the better-sqlite3
  // native binding from Stryker's sandboxed copy crashed the vitest worker
  // outright (Windows STATUS_ACCESS_VIOLATION) at any concurrency > 1.
  concurrency: 1,
  // Windows + a symlinked node_modules inside the sandbox also crashed the
  // native binding load — hardlink/copy instead.
  symlinkNodeModules: false,
  coverageAnalysis: 'perTest',
  // 100% is the real, currently-achieved baseline (rank.ts's one structurally
  // unkillable mutant is excluded via an inline `// Stryker disable` comment,
  // not a loosened threshold) — `break` fails the CLI (exit 1) the moment a
  // future change lets any mutant survive, which is what makes this a gate
  // instead of a report nobody reads.
  thresholds: { high: 100, low: 100, break: 100 },
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/store/index.html' },
  jsonReporter: { fileName: 'reports/mutation/store/mutation.json' },
  tempDirName: '.stryker-tmp-store',
};
