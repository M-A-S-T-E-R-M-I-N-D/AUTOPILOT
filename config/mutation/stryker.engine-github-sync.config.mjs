// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for packages/engine/src/github-sync.ts (backlog
 * web-msnswvcq-viays2, "MUTATION TESTING") — the pure policy primitive
 * behind board task web-mss4lpwi-p0w1d0 ("GITHUB 2/5 - sync any project"):
 * decides WHICH `gh`/`git` command a project-page "sync to GitHub" action
 * should run (`gh repo create ... --push` when no remote exists yet, a
 * plain `git push` re-sync otherwise), never executes anything itself. A
 * surviving mutant here could mean an existing remote gets force-recreated
 * instead of re-synced, or the `--private`/`--public` visibility flag
 * silently flips — exactly the "never force-push/recreate an existing
 * remote" and "private is the safe default" properties `planGithubSync`'s
 * own header and tests assert.
 *
 * Same shape as prompt-position-audit.ts/routing.ts's precedent:
 * github-sync.ts has zero imports (a fully self-contained pure module, per
 * its own file header) and github-sync.test.ts imports only vitest and
 * github-sync.js — no subprocess, no filesystem, no workspace package.
 *
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
export default {
  packageManager: 'pnpm',
  plugins: ['@stryker-mutator/vitest-runner'],
  testRunner: 'vitest',
  vitest: {
    // NOT the root vitest.config.ts — see this file's header for why.
    configFile: 'config/mutation/vitest.engine-github-sync.config.ts',
  },
  mutate: ['packages/engine/src/github-sync.ts'],
  concurrency: 1,
  symlinkNodeModules: false,
  coverageAnalysis: 'perTest',
  thresholds: { high: 100, low: 100, break: 100 },
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/engine-github-sync/index.html' },
  jsonReporter: { fileName: 'reports/mutation/engine-github-sync/mutation.json' },
  tempDirName: '.stryker-tmp-engine-github-sync',
};
