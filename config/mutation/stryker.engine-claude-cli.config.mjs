// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for packages/engine/src/adapters/claude-cli.ts (backlog
 * web-msnswvcq-viays2, "MUTATION TESTING") — next after gate.ts
 * (stryker.engine-gate.config.mjs) in `packages/engine/src/adapters/`.
 *
 * `parseModelEnvelope`, `buildClaudeArgs`, `ClaudeCliModel`, and
 * `StreamingClaudeCliModel` turn the local `claude` CLI's stdout/NDJSON
 * into the cost/token/activity facts the rest of AUTOPILOT trusts. A
 * surviving mutant here (e.g. `is_error === true` inverted, the
 * `CLI_STDIN_PROMPT_THRESHOLD` comparison flipped so a long prompt blows
 * past Windows' argv ceiling instead of going to stdin, or
 * `activitiesFromEvent`/`textDeltaFromEvent` wiring dropped) could mean
 * AUTOPILOT silently mis-bills a firing, corrupts a spawned command line,
 * or drops the live activity/answer stream without anyone noticing.
 *
 * claude-cli.ts's only runtime imports are `node:child_process` plus
 * ../ports.js (type-only), ../config.js, ../auth.js, and ../stream.js —
 * none of which touch `@autopilot/store` or a native addon — and
 * claude-cli.test.ts mocks `node:child_process` outright via `vi.mock`
 * rather than spawning anything real, so — like clock.ts,
 * instance-lock.ts, fs-control.ts, and gate.ts before it — this needs no
 * `@autopilot/store` alias and stays fast.
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
    configFile: 'config/mutation/vitest.engine-claude-cli.config.ts',
  },
  mutate: ['packages/engine/src/adapters/claude-cli.ts'],
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
  // KILLED AT THE SAME MUTANT TWICE (2026-09-21 and 2026-09-24): the nightly
  // sweep's runner for this config died with a bare `Killed` / exit 137 at
  // 78-80 of ~401 mutants both times — the OS out-of-memory killer, not a
  // timeout, and at the same position, so a specific mutant makes the test
  // process allocate without bound faster than Stryker's per-mutant timeout
  // can fire. Capping the runner's heap turns that into a JavaScript
  // out-of-memory inside the worker, which Stryker records as a runtime
  // error for that one mutant and restarts the runner, instead of the OS
  // taking down the whole run with no score at all. 2 GiB is ample for this
  // file's 133-test suite and well under the runner's 16 GiB.
  testRunnerNodeArgs: ['--max-old-space-size=2048'],
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
  htmlReporter: { fileName: 'reports/mutation/engine-claude-cli/index.html' },
  jsonReporter: { fileName: 'reports/mutation/engine-claude-cli/mutation.json' },
  tempDirName: '.stryker-tmp-engine-claude-cli',
};
