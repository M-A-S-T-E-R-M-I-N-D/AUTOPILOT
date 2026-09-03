// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for apps/dashboard/src/flight/doc-freshness.ts (backlog
 * web-msnswvcq-viays2, "MUTATION TESTING") — next after worktree.ts
 * (stryker.dashboard-worktree.config.mjs) in flight/'s pure logic, picked
 * back up here after the sweep detoured through packages/onboarding
 * (worked to exhaustion) and packages/mcp's info.ts
 * (stryker.mcp-info.config.mjs).
 *
 * `computeDocDrift` decides which docs in DOC_SUBJECTS have drifted out of
 * date relative to the code they describe — the data a future post-flight
 * sweep uses to propose doc-update tasks. A surviving mutant here (e.g. a
 * flipped `<=` letting a tied timestamp count as stale, or `newest` picking
 * the first stale subject instead of the newest one) would silently point
 * an operator at the wrong file or miss real drift entirely.
 *
 * doc-freshness.ts's only runtime import is `node:child_process`
 * (`execFileSync` against the real `git` binary) — no `@autopilot/store`,
 * so it never hits the better-sqlite3-in-sandbox gap. But its ORIGINAL
 * test suite hit a different, new sandbox gap: asserting real timestamps
 * for THIS repo's own DOC_SUBJECTS paths via `import.meta.dirname`
 * resolution. Stryker's sandbox never copies `.git` (verified: a fresh
 * sandbox's root has no `.git` dir), and the sandbox itself lives nested
 * inside the real repo (a gitignored `.stryker-tmp-<name>/sandbox-<id>/` dir) — so
 * `git -C <sandbox>` walks up and silently finds the REAL outer `.git`,
 * then resolves pathspecs relative to the sandbox's prefix
 * (`.stryker-tmp-.../sandbox-.../docs/epics/...`, which has no history),
 * returning empty instead of throwing. `doc-freshness.test.ts` now uses
 * the same disposable-tmpdir-repo pattern as git.test.ts instead, sidestepping
 * the gap entirely rather than depending on this checkout's real history.
 *
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
export default {
  packageManager: 'pnpm',
  plugins: ['@stryker-mutator/vitest-runner'],
  testRunner: 'vitest',
  vitest: {
    // NOT the root vitest.config.ts — see this file's header for why.
    configFile: 'config/mutation/vitest.dashboard-doc-freshness.config.ts',
  },
  mutate: ['apps/dashboard/src/flight/doc-freshness.ts'],
  concurrency: 1,
  symlinkNodeModules: false,
  coverageAnalysis: 'perTest',
  thresholds: { high: 100, low: 100, break: 100 },
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/dashboard-doc-freshness/index.html' },
  jsonReporter: { fileName: 'reports/mutation/dashboard-doc-freshness/mutation.json' },
  tempDirName: '.stryker-tmp-dashboard-doc-freshness',
};
