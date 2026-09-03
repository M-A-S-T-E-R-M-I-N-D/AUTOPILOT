// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for packages/engine/src/adapters/git.ts (backlog
 * web-msnswvcq-viays2, "MUTATION TESTING") — next after claude-cli.ts
 * (stryker.engine-claude-cli.config.mjs) in
 * `packages/engine/src/adapters/`.
 *
 * `GitVcs`/`GitHeadReader` are the only path through which AUTOPILOT reads
 * or mutates the target repo's git history: `land` merges and fast-forwards
 * branches, `commitAll`/`revertLast` write commits, `tag`/`notes` create
 * release attestations. A surviving mutant here (e.g. `--no-ff` dropped
 * from `land`'s merge args so a landing silently fast-forwards instead of
 * leaving an auditable merge commit, or `commitExists`'s exit-code check
 * inverted so a stale sha reads as real) could mean AUTOPILOT corrupts a
 * flight branch, mislands a release, or silently drops a checkpoint commit
 * without anyone noticing.
 *
 * git.ts's only runtime import is `node:child_process` (`execFile` /
 * `execFileSync` against the real `git` binary) plus `../ports.js` and
 * `../containment.js` (both type-only) — no `@autopilot/store` import, so
 * unlike adapters/pacer.ts and adapters/store.ts (see
 * stryker.store.config.mjs's docstring), this never reaches
 * `packages/store/src/db.ts` and never hits the better-sqlite3-in-sandbox
 * gap. git.test.ts runs real `git` commands against disposable tmpdir
 * repos it creates/tears down itself, and `git` is a system binary already
 * on PATH inside Stryker's sandbox — nothing workspace-scoped to copy in.
 *
 * The two Windows-specific fixes below were required for the prior
 * configs' narrow scope even without a native addon in the mutated file
 * itself — Stryker's sandboxed copy of the tree is enough on its own to
 * trip them — so both carry over here defensively.
 *
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
export default {
  packageManager: 'pnpm',
  plugins: ['@stryker-mutator/vitest-runner'],
  testRunner: 'vitest',
  vitest: {
    // NOT the root vitest.config.ts or packages/engine/test/**'s full suite
    // — see this file's header for why.
    configFile: 'config/mutation/vitest.engine-git.config.ts',
  },
  mutate: ['packages/engine/src/adapters/git.ts'],
  concurrency: 1,
  symlinkNodeModules: false,
  coverageAnalysis: 'perTest',
  thresholds: { high: 100, low: 100, break: 100 },
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/engine-git/index.html' },
  jsonReporter: { fileName: 'reports/mutation/engine-git/mutation.json' },
  tempDirName: '.stryker-tmp-engine-git',
};
