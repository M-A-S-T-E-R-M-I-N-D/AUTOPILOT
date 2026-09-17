// SPDX-FileCopyrightText: 2026 1337 · REL AZEUS · MΔSTERMIND
// SPDX-License-Identifier: Apache-2.0

/**
 * Mutation testing for packages/engine/src/guard.ts (backlog
 * web-msnswvcq-viays2, "MUTATION TESTING") — the nineteenth module wired
 * after store's rank.ts + schema.ts (stryker.store.config.mjs), engine's
 * release.ts + pace.ts (stryker.engine-release.config.mjs,
 * stryker.engine-pace.config.mjs), containment.ts
 * (stryker.engine-containment.config.mjs), inbox.ts
 * (stryker.engine-inbox.config.mjs), repo-map.ts
 * (stryker.engine-repo-map.config.mjs), auth.ts
 * (stryker.engine-auth.config.mjs), ask.ts (stryker.engine-ask.config.mjs),
 * prompt.ts (stryker.engine-prompt.config.mjs), resilience.ts
 * (stryker.engine-resilience.config.mjs), landing.ts
 * (stryker.engine-landing.config.mjs), firing.ts
 * (stryker.engine-firing.config.mjs), config.ts
 * (stryker.engine-config.config.mjs), info.ts
 * (stryker.engine-info.config.mjs), loop.ts
 * (stryker.engine-loop.config.mjs), guard-hook.ts
 * (stryker.engine-guard-hook.config.mjs), stream.ts
 * (stryker.engine-stream.config.mjs), and otlp.ts
 * (stryker.engine-otlp.config.mjs), widening one more slice.
 *
 * guard.ts is layer 2 of flight containment (docs/FLIGHT-CONTAINMENT.md): the
 * PreToolUse hook that BLOCKS an escaping Bash command (or an out-of-root
 * Read/Grep/Glob/Write/Edit/NotebookEdit) before it runs, plus the SOUL's
 * "additive git only" enforcement (deny force-push, reset --hard, rebase,
 * force branch delete, checkout main, force clean, filter-branch) and the
 * dashboard suicide-guard backstop. A surviving mutant here is a containment
 * hole: a flipped boundary regex that lets an absolute path outside the
 * target slip through, a dropped destructive-git subcommand, or a
 * pattern-only-flag exemption that stops being command-scoped. This is
 * exactly the kind of module where "tests pass but assert nothing" is
 * unacceptable — it is the actual guard between a flight and the rest of the
 * filesystem.
 *
 * guard.ts's only runtime import is `node:url` (fileURLToPath) — no
 * adapters/git.ts, no subprocess, no workspace package — same safe shape as
 * the eighteen prior modules.
 *
 * The two Windows-specific fixes below were required for the prior configs'
 * narrow scope even without a native addon or subprocess in the mutated
 * file itself — Stryker's sandboxed copy of the tree is enough on its own
 * to trip them — so both carry over here defensively.
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
    configFile: 'config/mutation/vitest.engine-guard.config.ts',
  },
  mutate: ['packages/engine/src/guard.ts'],
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
  htmlReporter: { fileName: 'reports/mutation/engine-guard/index.html' },
  jsonReporter: { fileName: 'reports/mutation/engine-guard/mutation.json' },
  tempDirName: '.stryker-tmp-engine-guard',
};
