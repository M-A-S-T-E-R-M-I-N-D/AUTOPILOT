// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for packages/engine/src/adapters/worktree.ts (backlog
 * web-msnswvcq-viays2, "MUTATION TESTING") — next after git.ts
 * (stryker.engine-git.config.mjs) in `packages/engine/src/adapters/`.
 *
 * `ensureWorktree`/`syncWorktreeBranch`/`removeWorktree` are the whole
 * bash-containment mechanism (docs/epics/0004-bash-containment-worktree.md):
 * they decide whether a flight's Bash runs isolated in a linked worktree or
 * falls back to the live target checkout, and whether a firing's commits
 * ever reach the branch the operator sees. A surviving mutant here (e.g.
 * `worktreeIsRegistered`'s equality check loosened so a stale registration
 * reads as current, the fast-forward/merge fallback order swapped, or
 * `syncWorktreeBranch`'s dirty-tree/wrong-branch refusal guards inverted)
 * could mean the containment boundary this epic exists for silently stops
 * holding, or a flight's work silently fails to reach the operator's branch.
 *
 * worktree.ts's only runtime import is `node:child_process` (`execFile`
 * against the real `git` binary, deliberately NOT importing adapters/git.ts
 * — see this module's own header) — no `@autopilot/store` alias, so like
 * git.ts before it, this never hits the better-sqlite3-in-sandbox gap.
 * worktree.test.ts runs real `git` commands against disposable tmpdir repos
 * it creates/tears down itself, same shape as git.test.ts.
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
    configFile: 'config/mutation/vitest.engine-worktree.config.ts',
  },
  mutate: ['packages/engine/src/adapters/worktree.ts'],
  concurrency: 1,
  symlinkNodeModules: false,
  coverageAnalysis: 'perTest',
  thresholds: { high: 100, low: 100, break: 100 },
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/engine-worktree/index.html' },
  jsonReporter: { fileName: 'reports/mutation/engine-worktree/mutation.json' },
  tempDirName: '.stryker-tmp-engine-worktree',
};
