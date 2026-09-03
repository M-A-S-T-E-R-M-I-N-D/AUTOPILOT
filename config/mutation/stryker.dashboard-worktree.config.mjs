// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for apps/dashboard/src/flight/worktree.ts (backlog
 * web-msnswvcq-viays2, "MUTATION TESTING") — next after gate-schedule.ts
 * (stryker.dashboard-gate-schedule.config.mjs), continuing to widen through
 * flight/'s other pure logic.
 *
 * worktree.ts's deriveWorktreePlan decides where a flight's linked worktree
 * lives and which branch it checks out — the containment guarantee (always a
 * SIBLING of target, never nested inside it) that
 * docs/epics/0004-bash-containment-worktree.md's Bash escape fix depends on.
 * A surviving mutant here (the wrong path segment, or a branch name losing
 * its uniqueness per projectId) could silently reopen the nested-worktree
 * escape hole or collide two flights' worktrees against the same target.
 *
 * Only import is `node:path` (a builtin, nothing to mock) and it's exercised
 * with concrete expected-output assertions by worktree.test.ts.
 *
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
export default {
  packageManager: 'pnpm',
  plugins: ['@stryker-mutator/vitest-runner'],
  testRunner: 'vitest',
  vitest: {
    // NOT the root vitest.config.ts — see this file's header for why.
    configFile: 'config/mutation/vitest.dashboard-worktree.config.ts',
  },
  mutate: ['apps/dashboard/src/flight/worktree.ts'],
  concurrency: 1,
  symlinkNodeModules: false,
  coverageAnalysis: 'perTest',
  thresholds: { high: 100, low: 100, break: 100 },
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/dashboard-worktree/index.html' },
  jsonReporter: { fileName: 'reports/mutation/dashboard-worktree/mutation.json' },
  tempDirName: '.stryker-tmp-dashboard-worktree',
};
