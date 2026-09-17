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
    configFile: 'config/mutation/vitest.dashboard-doc-freshness.config.ts',
  },
  mutate: ['apps/dashboard/src/flight/doc-freshness.ts'],
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
  htmlReporter: { fileName: 'reports/mutation/dashboard-doc-freshness/index.html' },
  jsonReporter: { fileName: 'reports/mutation/dashboard-doc-freshness/mutation.json' },
  tempDirName: '.stryker-tmp-dashboard-doc-freshness',
};
